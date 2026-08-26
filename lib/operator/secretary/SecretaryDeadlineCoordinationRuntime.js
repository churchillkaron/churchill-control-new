import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_DEADLINE_COORDINATION_V1";
const SOURCE = "secretary_deadline_coordination";
const DAY_MS = 24 * 60 * 60 * 1000;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function organizationId(context = {}) {
  const id = text(context.organizationId, 120);
  if (!id) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  return id;
}

function actorPartyId(context = {}) {
  const id = text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120);
  if (!id) throw new Error("SECRETARY_REQUESTED_BY_PARTY_REQUIRED");
  return id;
}

function iso(value, field, { required = false } = {}) {
  const raw = text(value, 180);
  if (!raw) {
    if (required) throw new Error(`SECRETARY_DEADLINE_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_DEADLINE_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
}

function deterministicUuid(seed) {
  const chars = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

async function many(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return Array.isArray(resolved.data) ? resolved.data : [];
}

function deadlineKey(payload = {}) {
  const key = text(payload.deadline_key || payload.deadlineKey || payload.deadline_reference || payload.deadlineReference, 700);
  if (!key) throw new Error("SECRETARY_DEADLINE_KEY_REQUIRED");
  return key;
}

function deadlineTaskId(organization, key) {
  return deterministicUuid(`avantiqo-secretary-deadline-v1:${organization}:${key}`);
}

function inputId(taskId, index, label) {
  return deterministicUuid(`avantiqo-secretary-deadline-input-v1:${taskId}:${index}:${label}`);
}

function followUpId(taskId, kind, scope, version) {
  return deterministicUuid(`avantiqo-secretary-deadline-follow-up-v1:${taskId}:${kind}:${scope || "deadline"}:${version}`);
}

function normalizeReminderOffsets(value) {
  const source = Array.isArray(value) ? value : [30, 7, 1];
  const normalized = [...new Set(source.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item >= 0 && item <= 3650).map((item) => Math.floor(item)))];
  return normalized.sort((a, b) => b - a).slice(0, 20);
}

function normalizeInputs(value, taskId, fallbackPartyId) {
  return list(value).slice(0, 100).map((item, index) => {
    const row = typeof item === "string" ? { label: item } : object(item);
    const label = text(row.label || row.description || row.name, 600);
    if (!label) throw new Error(`SECRETARY_DEADLINE_INPUT_LABEL_REQUIRED:${index}`);
    return {
      id: text(row.id, 120) || inputId(taskId, index, label),
      label,
      responsible_party_id: text(row.responsible_party_id || row.responsiblePartyId, 120) || fallbackPartyId || null,
      status: "MISSING",
      evidence: null,
      notes: text(row.notes, 1200) || null,
    };
  });
}

async function preferredActionType(organization, partyId) {
  if (!partyId) return "MESSAGE";
  const profile = await one(
    supabaseAdmin.from("secretary_contact_profiles")
      .select("preferred_channel,allow_calls,allow_messages")
      .eq("organization_id", organization)
      .eq("party_id", partyId)
      .maybeSingle(),
  );
  const channel = text(profile?.preferred_channel, 80).toLowerCase();
  if (channel.includes("email")) return "EMAIL";
  if (profile?.allow_messages !== false) return "MESSAGE";
  if (profile?.allow_calls !== false) return "CALL";
  return "REVIEW";
}

async function loadDeadlineTask(organization, payload = {}) {
  const directId = text(payload.deadline_id || payload.deadlineId, 120);
  const id = directId || deadlineTaskId(organization, deadlineKey(payload));
  return one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
}

async function mutateDeadlineTask(organization, payload, producer) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const task = await loadDeadlineTask(organization, payload);
    if (!task) throw new Error("SECRETARY_DEADLINE_NOT_FOUND");
    const produced = await producer(task, object(task.metadata));
    const patch = {
      ...object(produced.task_patch),
      metadata: produced.metadata,
      updated_at: new Date().toISOString(),
    };
    const updated = await supabaseAdmin.from("secretary_tasks")
      .update(patch)
      .eq("organization_id", organization)
      .eq("id", task.id)
      .eq("updated_at", task.updated_at)
      .select("*")
      .maybeSingle();
    if (updated.error) throw updated.error;
    if (updated.data) return { task: updated.data, output: object(produced.output) };
  }
  throw new Error("SECRETARY_DEADLINE_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

async function ensureFollowUp({ task, kind, scope = null, version = 1, dueAt, partyId = null, internal = false, instruction }) {
  const normalizedDueAt = iso(dueAt, "follow_up_due_at", { required: true });
  const id = followUpId(task.id, kind, scope, version);
  const existing = await one(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", task.organization_id)
      .eq("id", id)
      .maybeSingle(),
  );
  if (existing) return existing;
  const targetParty = partyId || task.owner_party_id || null;
  const actionType = internal ? "REVIEW" : await preferredActionType(task.organization_id, targetParty);
  const inserted = await supabaseAdmin.from("secretary_follow_ups").insert({
    id,
    organization_id: task.organization_id,
    entity_id: task.entity_id || null,
    owner_party_id: task.owner_party_id || null,
    contact_party_id: targetParty,
    task_id: task.id,
    action_type: actionType,
    reason: text(instruction, 4000),
    status: "PENDING",
    due_at: normalizedDueAt,
    created_by_party_id: task.created_by_party_id || task.owner_party_id || null,
    metadata: {
      execution_owner: "SECRETARY",
      execution_ready: true,
      execution_instruction: text(instruction, 4000),
      secretary_owned: true,
      secretary_deadline_coordination: true,
      secretary_deadline_task_id: task.id,
      secretary_deadline_kind: kind,
      secretary_deadline_scope: scope,
      secretary_deadline_version: version,
      internal_review_only: internal,
      legal_compliance_inferred: false,
      legal_requirement_satisfied_inferred: false,
      statutory_classification_inferred: false,
      external_authority_used: false,
    },
  }).select("*").single();
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      return one(supabaseAdmin.from("secretary_follow_ups").select("*").eq("organization_id", task.organization_id).eq("id", id).single());
    }
    throw inserted.error;
  }
  return inserted.data;
}

async function cancelDeadlineFollowUps({ task, version = null, scope = null, kinds = null, reason }) {
  const rows = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,metadata")
      .eq("organization_id", task.organization_id)
      .eq("task_id", task.id)
      .eq("status", "PENDING")
      .limit(1000),
  );
  const allowedKinds = kinds ? new Set(kinds) : null;
  const ids = rows.filter((row) => {
    const metadata = object(row.metadata);
    if (metadata.secretary_deadline_coordination !== true) return false;
    if (version !== null && Number(metadata.secretary_deadline_version) !== Number(version)) return false;
    if (scope !== null && text(metadata.secretary_deadline_scope, 200) !== text(scope, 200)) return false;
    if (allowedKinds && !allowedKinds.has(text(metadata.secretary_deadline_kind, 100))) return false;
    return true;
  }).map((row) => row.id);
  if (!ids.length) return [];
  const now = new Date().toISOString();
  const result = await supabaseAdmin.from("secretary_follow_ups")
    .update({ status: "CANCELLED", completed_at: now, result: text(reason, 1000), updated_at: now })
    .eq("organization_id", task.organization_id)
    .in("id", ids);
  if (result.error) throw result.error;
  return ids;
}

function deadlineInstruction(metadata, offsetDays) {
  return [
    `Review tracked deadline: ${text(metadata.title || metadata.deadline_key, 600)}.`,
    `Recorded due date: ${text(metadata.due_at, 180)}.`,
    offsetDays === 0 ? "This is the recorded due date." : `${offsetDays} day${offsetDays === 1 ? "" : "s"} remain on the administrative reminder schedule.`,
    "Check evidence, missing inputs, and any required executive decision. Do not infer legal compliance, non-compliance, filing validity, waiver, or satisfaction of the underlying obligation.",
  ].join(" ");
}

function inputInstruction(metadata, item, chase = false) {
  return [
    chase ? "Follow up for the still-missing deadline input." : "Request the missing deadline input.",
    `Deadline: ${text(metadata.title || metadata.deadline_key, 600)}.`,
    `Input: ${text(item.label, 600)}.`,
    `Recorded due date: ${text(metadata.due_at, 180)}.`,
    "Ask only for the requested input or explicit evidence that it is unavailable. Do not claim legal sufficiency, compliance, approval, acceptance, filing, or submission.",
  ].join(" ");
}

function escalationInstruction(metadata, item) {
  return [
    `Executive review: deadline input remains unresolved for ${text(metadata.title || metadata.deadline_key, 600)}.`,
    `Input: ${text(item.label, 600)}.`,
    `Recorded due date: ${text(metadata.due_at, 180)}.`,
    "This is an administrative risk escalation only. It does not determine legal breach, statutory non-compliance, validity, or whether the obligation is satisfied.",
  ].join(" ");
}

function temporalStatus(metadata, now = new Date().toISOString()) {
  if (metadata.deadline_status === "COMPLETION_EVIDENCE_RECORDED") return "COMPLETION_EVIDENCE_RECORDED";
  if (metadata.deadline_status === "COORDINATION_CANCELLED") return "COORDINATION_CANCELLED";
  const due = Date.parse(metadata.due_at || "");
  const current = Date.parse(now);
  if (!Number.isFinite(due) || !Number.isFinite(current)) return "UNKNOWN";
  if (current > due) return "OVERDUE_TEMPORALLY";
  if (current === due) return "DUE_NOW";
  return "UPCOMING";
}

async function materializeDeadlineFollowUps(task, nowValue = new Date().toISOString()) {
  const metadata = object(task.metadata);
  if (metadata.deadline_status !== "TRACKING") return [];
  const dueMs = Date.parse(metadata.due_at || "");
  const nowMs = Date.parse(nowValue);
  if (!Number.isFinite(dueMs) || !Number.isFinite(nowMs)) throw new Error("SECRETARY_DEADLINE_DUE_AT_INVALID");
  const version = Number(metadata.version || 1);
  const ids = [];

  for (const offset of normalizeReminderOffsets(metadata.reminder_offsets_days)) {
    const reminderMs = dueMs - offset * DAY_MS;
    if (reminderMs < nowMs) continue;
    const row = await ensureFollowUp({
      task,
      kind: "DEADLINE_REMINDER",
      scope: `offset:${offset}`,
      version,
      dueAt: new Date(reminderMs).toISOString(),
      partyId: task.owner_party_id,
      internal: true,
      instruction: deadlineInstruction(metadata, offset),
    });
    ids.push(row.id);
  }

  for (const item of list(metadata.required_inputs)) {
    if (item.status !== "MISSING" || !item.responsible_party_id) continue;
    const request = await ensureFollowUp({
      task,
      kind: "INPUT_REQUEST",
      scope: item.id,
      version,
      dueAt: nowValue,
      partyId: item.responsible_party_id,
      internal: false,
      instruction: inputInstruction(metadata, item, false),
    });
    ids.push(request.id);
    if (dueMs > nowMs + 2 * 60 * 1000) {
      const chaseMs = nowMs + Math.max(60 * 1000, Math.floor((dueMs - nowMs) / 2));
      const chase = await ensureFollowUp({
        task,
        kind: "INPUT_CHASE",
        scope: item.id,
        version,
        dueAt: new Date(chaseMs).toISOString(),
        partyId: item.responsible_party_id,
        internal: false,
        instruction: inputInstruction(metadata, item, true),
      });
      ids.push(chase.id);
    }
    const escalationMs = Math.max(nowMs, dueMs - 7 * DAY_MS);
    const escalation = await ensureFollowUp({
      task,
      kind: "INPUT_ESCALATION_REVIEW",
      scope: item.id,
      version,
      dueAt: new Date(escalationMs).toISOString(),
      partyId: task.owner_party_id,
      internal: true,
      instruction: escalationInstruction(metadata, item),
    });
    ids.push(escalation.id);
  }

  if (nowMs > dueMs) {
    const overdue = await ensureFollowUp({
      task,
      kind: "OVERDUE_REVIEW",
      scope: "deadline",
      version,
      dueAt: nowValue,
      partyId: task.owner_party_id,
      internal: true,
      instruction: [
        `The recorded deadline for ${text(metadata.title || metadata.deadline_key, 600)} has passed in time.`,
        `Recorded due date: ${text(metadata.due_at, 180)}.`,
        "Review evidence and decide next administrative steps. A passed date is not, by itself, a legal or compliance conclusion.",
      ].join(" "),
    });
    ids.push(overdue.id);
  }

  return [...new Set(ids)];
}

export async function registerSecretaryDeadline({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const key = deadlineKey(payload);
  const id = deadlineTaskId(organization, key);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 300);
  const sourceReference = text(payload.source_reference || payload.sourceReference, 1600);
  const dueAt = iso(payload.due_at || payload.dueAt, "due_at", { required: true });
  const title = text(payload.title, 600) || key;
  if (!evidenceId) throw new Error("SECRETARY_DEADLINE_EVIDENCE_REQUIRED");
  if (!sourceReference) throw new Error("SECRETARY_DEADLINE_SOURCE_REFERENCE_REQUIRED");

  let task = await one(
    supabaseAdmin.from("secretary_tasks").select("*").eq("organization_id", organization).eq("id", id).maybeSingle(),
  );
  if (!task) {
    const responsiblePartyId = text(payload.responsible_party_id || payload.responsiblePartyId, 120) || null;
    const metadata = {
      secretary_role: "EXECUTIVE_SECRETARY",
      secretary_owned: true,
      secretary_deadline_coordination: true,
      deadline_contract: CONTRACT,
      deadline_key: key,
      title,
      deadline_type: text(payload.deadline_type || payload.deadlineType, 120).toUpperCase() || "OTHER",
      deadline_type_explicit_not_inferred: true,
      jurisdiction: text(payload.jurisdiction, 300) || null,
      authority_label: text(payload.authority_label || payload.authorityLabel, 500) || null,
      authority_source_reference: sourceReference,
      due_at: dueAt,
      due_date_evidence_id: evidenceId,
      responsible_party_id: responsiblePartyId,
      reminder_offsets_days: normalizeReminderOffsets(payload.reminder_offsets_days || payload.reminderOffsetsDays),
      required_inputs: normalizeInputs(payload.required_inputs || payload.requiredInputs, id, responsiblePartyId),
      deadline_status: "TRACKING",
      version: 1,
      revisions: [],
      completion_evidence: null,
      legal_compliance_inferred: false,
      legal_non_compliance_inferred: false,
      legal_requirement_satisfied_inferred: false,
      statutory_classification_inferred: false,
      filing_validity_inferred: false,
      external_authority_used: false,
    };
    const inserted = await supabaseAdmin.from("secretary_tasks").insert({
      id,
      organization_id: organization,
      entity_id: text(payload.entity_id || payload.entityId, 120) || context.entityId || null,
      owner_party_id: actor,
      contact_party_id: responsiblePartyId,
      title: `Track deadline: ${title}`,
      details: `Evidence-backed Secretary deadline coordination for ${key}.`,
      status: "IN_PROGRESS",
      priority: text(payload.priority, 40).toUpperCase() || "HIGH",
      due_at: dueAt,
      remind_at: null,
      source: SOURCE,
      created_by_party_id: actor,
      metadata,
    }).select("*").single();
    if (inserted.error) {
      if (inserted.error.code !== "23505") throw inserted.error;
      task = await loadDeadlineTask(organization, { deadline_id: id });
    } else task = inserted.data;
  }

  const followUpIds = await materializeDeadlineFollowUps(task);
  return {
    status: "registered",
    contract: CONTRACT,
    deadline_id: task.id,
    task,
    deterministic_deadline_id: task.id === id,
    follow_up_ids: followUpIds,
    deadline_type_inferred: false,
    legal_compliance_inferred: false,
    external_authority_used: false,
  };
}

export async function readSecretaryDeadline({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const task = await loadDeadlineTask(organization, payload);
  if (!task) throw new Error("SECRETARY_DEADLINE_NOT_FOUND");
  const followUps = await many(
    supabaseAdmin.from("secretary_follow_ups").select("*")
      .eq("organization_id", organization).eq("task_id", task.id)
      .order("due_at", { ascending: true }).limit(1000),
  );
  const metadata = object(task.metadata);
  return {
    status: "read",
    contract: CONTRACT,
    deadline_id: task.id,
    task,
    temporal_status: temporalStatus(metadata),
    required_inputs: list(metadata.required_inputs),
    revisions: list(metadata.revisions),
    completion_evidence: metadata.completion_evidence || null,
    follow_ups: followUps,
    legal_compliance_inferred: false,
    legal_non_compliance_inferred: false,
    legal_requirement_satisfied_inferred: false,
    external_authority_used: false,
  };
}

export async function listSecretaryDeadlines({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  let query = supabaseAdmin.from("secretary_tasks")
    .select("*")
    .eq("organization_id", organization)
    .eq("source", SOURCE)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(Math.min(300, Math.max(1, Number(payload.limit || 100))));
  if (payload.include_cancelled !== true && payload.includeCancelled !== true) query = query.neq("status", "CANCELLED");
  const tasks = await many(query);
  const q = text(payload.query, 300).toLowerCase();
  const type = text(payload.deadline_type || payload.deadlineType, 120).toUpperCase();
  const status = text(payload.deadline_status || payload.deadlineStatus, 120).toUpperCase();
  const documents = tasks.filter((task) => {
    const metadata = object(task.metadata);
    if (type && text(metadata.deadline_type, 120).toUpperCase() !== type) return false;
    if (status && text(metadata.deadline_status, 120).toUpperCase() !== status) return false;
    if (!q) return true;
    return [metadata.deadline_key, metadata.title, metadata.deadline_type, metadata.jurisdiction, metadata.authority_label]
      .some((value) => text(value, 1000).toLowerCase().includes(q));
  }).map((task) => ({
    deadline_id: task.id,
    title: object(task.metadata).title,
    deadline_key: object(task.metadata).deadline_key,
    deadline_type: object(task.metadata).deadline_type,
    due_at: object(task.metadata).due_at,
    deadline_status: object(task.metadata).deadline_status,
    temporal_status: temporalStatus(object(task.metadata)),
    missing_input_count: list(object(task.metadata).required_inputs).filter((item) => item.status === "MISSING").length,
  }));
  return {
    status: "listed",
    contract: CONTRACT,
    count: documents.length,
    deadlines: documents,
    legal_compliance_inferred: false,
    external_authority_used: false,
  };
}

export async function recordSecretaryDeadlineInput({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const inputIdValue = text(payload.input_id || payload.inputId, 120);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 300);
  const inputStatus = text(payload.input_status || payload.inputStatus || "RECEIVED", 80).toUpperCase();
  if (!inputIdValue) throw new Error("SECRETARY_DEADLINE_INPUT_ID_REQUIRED");
  if (!evidenceId) throw new Error("SECRETARY_DEADLINE_INPUT_EVIDENCE_REQUIRED");
  if (!["RECEIVED", "UNAVAILABLE"].includes(inputStatus)) throw new Error("SECRETARY_DEADLINE_INPUT_STATUS_INVALID");
  const sourceReference = text(payload.source_reference || payload.sourceReference, 1600);
  if (inputStatus === "RECEIVED" && !sourceReference) throw new Error("SECRETARY_DEADLINE_INPUT_SOURCE_REFERENCE_REQUIRED");

  const changed = await mutateDeadlineTask(organization, payload, async (_task, metadata) => {
    const items = list(metadata.required_inputs);
    const target = items.find((item) => item.id === inputIdValue);
    if (!target) throw new Error("SECRETARY_DEADLINE_INPUT_NOT_FOUND");
    if (target.evidence?.evidence_id === evidenceId && target.status === inputStatus) return { metadata, output: { input: target, idempotent: true, version: Number(metadata.version || 1) } };
    const now = new Date().toISOString();
    const updatedInput = {
      ...target,
      status: inputStatus,
      evidence: {
        evidence_id: evidenceId,
        source_reference: sourceReference || null,
        reason: text(payload.reason, 1600) || null,
        recorded_at: now,
        recorded_by_party_id: actor,
      },
    };
    const requiredInputs = items.map((item) => item.id === inputIdValue ? updatedInput : item);
    return {
      metadata: { ...metadata, required_inputs: requiredInputs, external_authority_used: false },
      output: { input: updatedInput, idempotent: false, version: Number(metadata.version || 1) },
    };
  });

  const cancelled = await cancelDeadlineFollowUps({
    task: changed.task,
    version: changed.output.version,
    scope: inputIdValue,
    kinds: ["INPUT_REQUEST", "INPUT_CHASE", "INPUT_ESCALATION_REVIEW"],
    reason: `Input ${inputStatus.toLowerCase()} evidence recorded; stale input follow-through cancelled.`,
  });
  return {
    status: changed.output.idempotent ? "input_already_recorded" : "input_evidence_recorded",
    task: changed.task,
    input: changed.output.input,
    idempotent: changed.output.idempotent,
    cancelled_follow_up_ids: cancelled,
    input_sufficiency_inferred: false,
    legal_compliance_inferred: false,
    external_authority_used: false,
  };
}

export async function reviseSecretaryDeadline({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const newDueAt = iso(payload.new_due_at || payload.newDueAt, "new_due_at", { required: true });
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 300);
  const sourceReference = text(payload.source_reference || payload.sourceReference, 1600);
  const reason = text(payload.reason, 1600);
  if (!evidenceId) throw new Error("SECRETARY_DEADLINE_REVISION_EVIDENCE_REQUIRED");
  if (!sourceReference) throw new Error("SECRETARY_DEADLINE_REVISION_SOURCE_REFERENCE_REQUIRED");
  if (!reason) throw new Error("SECRETARY_DEADLINE_REVISION_REASON_REQUIRED");

  const changed = await mutateDeadlineTask(organization, payload, async (_task, metadata) => {
    const revisions = list(metadata.revisions);
    const duplicate = revisions.find((revision) => revision.evidence_id === evidenceId);
    if (duplicate) return { metadata, output: { revision: duplicate, idempotent: true, old_version: Number(metadata.version || 1), new_version: Number(metadata.version || 1) } };
    const oldVersion = Number(metadata.version || 1);
    const newVersion = oldVersion + 1;
    const revision = {
      revision: newVersion,
      previous_due_at: metadata.due_at,
      new_due_at: newDueAt,
      evidence_id: evidenceId,
      source_reference: sourceReference,
      reason,
      revised_at: new Date().toISOString(),
      revised_by_party_id: actor,
      inferred: false,
    };
    return {
      metadata: {
        ...metadata,
        due_at: newDueAt,
        due_date_evidence_id: evidenceId,
        authority_source_reference: sourceReference,
        version: newVersion,
        revisions: [...revisions, revision].slice(-100),
        deadline_status: "TRACKING",
        completion_evidence: null,
        external_authority_used: false,
      },
      task_patch: { due_at: newDueAt, status: "IN_PROGRESS", completed_at: null },
      output: { revision, idempotent: false, old_version: oldVersion, new_version: newVersion },
    };
  });

  if (!changed.output.idempotent) {
    await cancelDeadlineFollowUps({ task: changed.task, version: changed.output.old_version, reason: "Deadline revised from explicit evidence; prior schedule fenced." });
  }
  const followUpIds = await materializeDeadlineFollowUps(changed.task);
  return {
    status: changed.output.idempotent ? "revision_already_recorded" : "deadline_revised",
    task: changed.task,
    revision: changed.output.revision,
    idempotent: changed.output.idempotent,
    follow_up_ids: followUpIds,
    prior_due_date_preserved: true,
    deadline_change_inferred: false,
    legal_compliance_inferred: false,
    external_authority_used: false,
  };
}

export async function recordSecretaryDeadlineCompletionEvidence({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 300);
  const sourceReference = text(payload.source_reference || payload.sourceReference, 1600);
  if (!evidenceId) throw new Error("SECRETARY_DEADLINE_COMPLETION_EVIDENCE_REQUIRED");
  if (!sourceReference) throw new Error("SECRETARY_DEADLINE_COMPLETION_SOURCE_REFERENCE_REQUIRED");

  const changed = await mutateDeadlineTask(organization, payload, async (_task, metadata) => {
    if (metadata.completion_evidence?.evidence_id === evidenceId) return { metadata, output: { evidence: metadata.completion_evidence, idempotent: true } };
    const evidence = {
      evidence_id: evidenceId,
      source_reference: sourceReference,
      description: text(payload.description, 2000) || null,
      recorded_at: new Date().toISOString(),
      recorded_by_party_id: actor,
    };
    return {
      metadata: {
        ...metadata,
        deadline_status: "COMPLETION_EVIDENCE_RECORDED",
        completion_evidence: evidence,
        legal_compliance_inferred: false,
        legal_non_compliance_inferred: false,
        legal_requirement_satisfied_inferred: false,
        filing_validity_inferred: false,
        external_authority_used: false,
      },
      task_patch: { status: "DONE", completed_at: new Date().toISOString() },
      output: { evidence, idempotent: false },
    };
  });
  const cancelled = await cancelDeadlineFollowUps({ task: changed.task, reason: "Completion evidence recorded; Secretary deadline follow-through closed without legal conclusion." });
  return {
    status: changed.output.idempotent ? "completion_evidence_already_recorded" : "completion_evidence_recorded",
    task: changed.task,
    completion_evidence: changed.output.evidence,
    cancelled_follow_up_ids: cancelled,
    idempotent: changed.output.idempotent,
    deadline_requirement_satisfied_inferred: false,
    legal_compliance_inferred: false,
    filing_validity_inferred: false,
    external_authority_used: false,
  };
}

export async function refreshSecretaryDeadline({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const task = await loadDeadlineTask(organization, payload);
  if (!task) throw new Error("SECRETARY_DEADLINE_NOT_FOUND");
  const now = iso(payload.now, "now") || new Date().toISOString();
  const followUpIds = await materializeDeadlineFollowUps(task, now);
  const metadata = object(task.metadata);
  return {
    status: "refreshed",
    contract: CONTRACT,
    deadline_id: task.id,
    temporal_status: temporalStatus(metadata, now),
    follow_up_ids: followUpIds,
    overdue_is_temporal_only: true,
    legal_non_compliance_inferred: false,
    legal_compliance_inferred: false,
    external_authority_used: false,
  };
}

export async function cancelSecretaryDeadlineCoordination({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const reason = text(payload.reason, 1200) || "Secretary deadline coordination cancelled.";
  const changed = await mutateDeadlineTask(organization, payload, async (_task, metadata) => ({
    metadata: { ...metadata, deadline_status: "COORDINATION_CANCELLED", coordination_cancel_reason: reason, external_authority_used: false },
    task_patch: { status: "CANCELLED", completed_at: new Date().toISOString() },
  }));
  const cancelled = await cancelDeadlineFollowUps({ task: changed.task, reason });
  return {
    status: "coordination_cancelled",
    task: changed.task,
    cancelled_follow_up_ids: cancelled,
    external_deadline_cancelled: false,
    obligation_waived: false,
    legal_compliance_inferred: false,
    external_authority_used: false,
  };
}

export default Object.freeze({
  register: registerSecretaryDeadline,
  read: readSecretaryDeadline,
  list: listSecretaryDeadlines,
  recordInput: recordSecretaryDeadlineInput,
  revise: reviseSecretaryDeadline,
  recordCompletion: recordSecretaryDeadlineCompletionEvidence,
  refresh: refreshSecretaryDeadline,
  cancel: cancelSecretaryDeadlineCoordination,
});
