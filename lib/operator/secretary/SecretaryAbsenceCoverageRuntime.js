import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_ABSENCE_COVERAGE_V1";
const SOURCE = "secretary_absence_coverage";
const ALLOWED_SCOPES = new Set([
  "CALENDAR_COORDINATION",
  "CORRESPONDENCE_TRIAGE",
  "CALL_SCREENING",
  "TASK_ROUTING",
  "FOLLOW_UP_COORDINATION",
  "MEETING_COORDINATION",
  "VISITOR_COORDINATION",
  "DOCUMENT_COORDINATION",
  "DEADLINE_COORDINATION",
  "EXPENSE_ADMINISTRATION",
  "TRAVEL_COORDINATION",
]);
const FORBIDDEN_SCOPE_PATTERN = /(PAYMENT|PURCHASE|SIGN|CONTRACT|LEGAL|BINDING|SUBMISSION|FARE|RATE|APPROVAL|CREDENTIAL|PASSWORD|SECRET|TOKEN)/i;

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
    if (required) throw new Error(`SECRETARY_ABSENCE_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_ABSENCE_${field.toUpperCase()}_INVALID`);
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

function absenceKey(payload = {}) {
  const explicit = text(payload.absence_key || payload.absenceKey || payload.coverage_reference || payload.coverageReference, 700);
  if (explicit) return explicit;
  const owner = text(payload.owner_party_id || payload.ownerPartyId, 120);
  const start = text(payload.starts_at || payload.startsAt, 180);
  const end = text(payload.ends_at || payload.endsAt, 180);
  if (!owner || !start || !end) throw new Error("SECRETARY_ABSENCE_KEY_OR_WINDOW_REQUIRED");
  return `${owner}:${start}:${end}`;
}

function absenceTaskId(organization, key) {
  return deterministicUuid(`avantiqo-secretary-absence-v1:${organization}:${key}`);
}

function absenceBlockId(taskId) {
  return deterministicUuid(`avantiqo-secretary-absence-calendar-block-v1:${taskId}`);
}

function followUpId(taskId, kind, version) {
  return deterministicUuid(`avantiqo-secretary-absence-follow-up-v1:${taskId}:${kind}:${version}`);
}

function normalizeScopes(value) {
  const source = list(value).map((item) => text(item, 120).toUpperCase()).filter(Boolean);
  if (!source.length) throw new Error("SECRETARY_ABSENCE_COVERAGE_SCOPES_REQUIRED");
  const unique = [...new Set(source)];
  for (const scope of unique) {
    if (FORBIDDEN_SCOPE_PATTERN.test(scope) || !ALLOWED_SCOPES.has(scope)) {
      throw new Error(`SECRETARY_ABSENCE_COVERAGE_SCOPE_FORBIDDEN:${scope}`);
    }
  }
  return unique;
}

async function assertParty(organization, partyId, label) {
  const id = text(partyId, 120);
  if (!id) throw new Error(`SECRETARY_ABSENCE_${label}_PARTY_REQUIRED`);
  const party = await one(
    supabaseAdmin.from("parties")
      .select("id,display_name,email,phone,party_type,status")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!party) throw new Error(`SECRETARY_ABSENCE_${label}_PARTY_NOT_FOUND`);
  return party;
}

async function preferredActionType(organization, partyId) {
  if (!partyId) return "REVIEW";
  const profile = await one(
    supabaseAdmin.from("secretary_contact_profiles")
      .select("preferred_channel,allow_calls,allow_messages")
      .eq("organization_id", organization)
      .eq("party_id", partyId)
      .maybeSingle(),
  );
  const preferred = text(profile?.preferred_channel, 80).toLowerCase();
  if (preferred.includes("email")) return "EMAIL";
  if (profile?.allow_messages !== false) return "MESSAGE";
  if (profile?.allow_calls !== false) return "CALL";
  return "REVIEW";
}

function temporalStatus(metadata, now = new Date().toISOString()) {
  if (metadata.coverage_status === "CANCELLED") return "CANCELLED";
  if (metadata.coverage_status === "ENDED_EARLY") return "ENDED_EARLY";
  const current = Date.parse(now);
  const start = Date.parse(metadata.starts_at || "");
  const end = Date.parse(metadata.ends_at || "");
  if (![current, start, end].every(Number.isFinite)) return "UNKNOWN";
  if (current < start) return "SCHEDULED";
  if (current >= end) return "EXPIRED";
  return "ACTIVE";
}

async function loadCoverageTask(organization, payload = {}) {
  const direct = text(payload.coverage_id || payload.coverageId || payload.absence_id || payload.absenceId, 120);
  const id = direct || absenceTaskId(organization, absenceKey(payload));
  return one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
}

async function mutateCoverageTask(organization, payload, producer) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const task = await loadCoverageTask(organization, payload);
    if (!task) throw new Error("SECRETARY_ABSENCE_COVERAGE_NOT_FOUND");
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
  throw new Error("SECRETARY_ABSENCE_COVERAGE_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

async function ensureCalendarBlock({ task, metadata }) {
  const id = absenceBlockId(task.id);
  const existing = await one(
    supabaseAdmin.from("secretary_calendar_events")
      .select("*")
      .eq("organization_id", task.organization_id)
      .eq("id", id)
      .maybeSingle(),
  );
  if (existing) return existing;
  const inserted = await supabaseAdmin.from("secretary_calendar_events").insert({
    id,
    organization_id: task.organization_id,
    entity_id: task.entity_id || null,
    owner_party_id: metadata.owner_party_id,
    contact_party_id: null,
    title: `Out of office: ${text(metadata.reason || "Absence coverage", 300)}`,
    description: "Secretary-managed absence block. Existing appointments are not silently cancelled; future overlapping bookings are fenced by this active block.",
    event_type: "BLOCK",
    status: "CONFIRMED",
    starts_at: metadata.starts_at,
    ends_at: metadata.ends_at,
    timezone: metadata.timezone || "UTC",
    all_day: metadata.all_day === true,
    location: null,
    recurrence: {},
    source: SOURCE,
    created_by_party_id: task.created_by_party_id || task.owner_party_id || null,
    updated_by_party_id: task.created_by_party_id || task.owner_party_id || null,
    metadata: {
      secretary_absence_coverage: true,
      secretary_absence_task_id: task.id,
      coverage_version: Number(metadata.version || 1),
      delegate_party_id: metadata.delegate_party_id,
      coverage_scopes: metadata.coverage_scopes,
      existing_calendar_events_cancelled: false,
      platform_permissions_mutated: false,
      delegated_binding_authority_created: false,
      external_authority_used: false,
    },
  }).select("*").single();
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      return one(supabaseAdmin.from("secretary_calendar_events").select("*").eq("organization_id", task.organization_id).eq("id", id).single());
    }
    throw inserted.error;
  }
  return inserted.data;
}

async function reviseCalendarBlock({ task, metadata }) {
  const id = absenceBlockId(task.id);
  const block = await one(
    supabaseAdmin.from("secretary_calendar_events")
      .select("*")
      .eq("organization_id", task.organization_id)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!block) return ensureCalendarBlock({ task, metadata });
  const updated = await one(
    supabaseAdmin.from("secretary_calendar_events")
      .update({
        owner_party_id: metadata.owner_party_id,
        title: `Out of office: ${text(metadata.reason || "Absence coverage", 300)}`,
        starts_at: metadata.starts_at,
        ends_at: metadata.ends_at,
        timezone: metadata.timezone || "UTC",
        all_day: metadata.all_day === true,
        status: "CONFIRMED",
        updated_at: new Date().toISOString(),
        metadata: {
          ...object(block.metadata),
          secretary_absence_coverage: true,
          secretary_absence_task_id: task.id,
          coverage_version: Number(metadata.version || 1),
          delegate_party_id: metadata.delegate_party_id,
          coverage_scopes: metadata.coverage_scopes,
          existing_calendar_events_cancelled: false,
          platform_permissions_mutated: false,
          delegated_binding_authority_created: false,
          external_authority_used: false,
        },
      })
      .eq("organization_id", task.organization_id)
      .eq("id", id)
      .select("*")
      .single(),
  );
  return updated;
}

async function setCalendarBlockStatus(task, status) {
  const id = absenceBlockId(task.id);
  const result = await supabaseAdmin.from("secretary_calendar_events")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("organization_id", task.organization_id)
    .eq("id", id);
  if (result.error) throw result.error;
}

async function ensureFollowUp({ task, metadata, kind, dueAt, partyId, instruction }) {
  const version = Number(metadata.version || 1);
  const id = followUpId(task.id, kind, version);
  const existing = await one(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", task.organization_id)
      .eq("id", id)
      .maybeSingle(),
  );
  if (existing) return existing;
  const target = partyId || task.owner_party_id;
  const inserted = await supabaseAdmin.from("secretary_follow_ups").insert({
    id,
    organization_id: task.organization_id,
    entity_id: task.entity_id || null,
    owner_party_id: task.owner_party_id || null,
    contact_party_id: target || null,
    task_id: task.id,
    action_type: await preferredActionType(task.organization_id, target),
    reason: text(instruction, 4000),
    status: "PENDING",
    due_at: dueAt,
    created_by_party_id: task.created_by_party_id || task.owner_party_id || null,
    metadata: {
      execution_owner: "SECRETARY",
      execution_ready: true,
      execution_instruction: text(instruction, 4000),
      secretary_owned: true,
      secretary_absence_coverage: true,
      secretary_absence_task_id: task.id,
      secretary_absence_kind: kind,
      secretary_absence_version: version,
      coverage_scopes: metadata.coverage_scopes,
      platform_permissions_mutated: false,
      delegated_binding_authority_created: false,
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

async function cancelCoverageFollowUps({ task, version = null, kinds = null, reason }) {
  const rows = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,metadata")
      .eq("organization_id", task.organization_id)
      .eq("task_id", task.id)
      .eq("status", "PENDING")
      .limit(500),
  );
  const allowed = kinds ? new Set(kinds) : null;
  const ids = rows.filter((row) => {
    const metadata = object(row.metadata);
    if (metadata.secretary_absence_coverage !== true) return false;
    if (version !== null && Number(metadata.secretary_absence_version) !== Number(version)) return false;
    if (allowed && !allowed.has(text(metadata.secretary_absence_kind, 100))) return false;
    return true;
  }).map((row) => row.id);
  if (!ids.length) return [];
  const now = new Date().toISOString();
  const result = await supabaseAdmin.from("secretary_follow_ups")
    .update({ status: "CANCELLED", completed_at: now, result: text(reason, 1200), updated_at: now })
    .eq("organization_id", task.organization_id)
    .in("id", ids);
  if (result.error) throw result.error;
  return ids;
}

function handoffInstruction(metadata) {
  return [
    `Temporary Secretary coverage handoff for ${text(metadata.reason || metadata.absence_key, 500)}.`,
    `Window: ${metadata.starts_at} to ${metadata.ends_at}.`,
    `Administrative scopes: ${list(metadata.coverage_scopes).join(", ")}.`,
    metadata.handoff_notes ? `Handoff notes: ${text(metadata.handoff_notes, 1600)}.` : null,
    "This coverage does not grant platform permissions or authority to purchase, pay, sign, accept contracts/legal terms, make binding submissions, accept fares/rates, or approve high-authority external actions. Escalate those exact steps to the owner.",
  ].filter(Boolean).join(" ");
}

function returnInstruction(metadata) {
  return [
    `Return coverage to the owner after temporary absence: ${text(metadata.reason || metadata.absence_key, 500)}.`,
    `Coverage ended at ${metadata.ends_at}.`,
    "Review open administrative items, unresolved escalations, and handoff notes. Temporary coverage expires automatically and creates no continuing authority or platform permission.",
  ].join(" ");
}

async function materializeCoverageFollowUps(task, nowValue = new Date().toISOString()) {
  const metadata = object(task.metadata);
  if (["CANCELLED", "ENDED_EARLY"].includes(metadata.coverage_status)) return [];
  const startMs = Date.parse(metadata.starts_at);
  const endMs = Date.parse(metadata.ends_at);
  const nowMs = Date.parse(nowValue);
  const handoffDue = new Date(Math.max(nowMs, startMs)).toISOString();
  const handoff = await ensureFollowUp({
    task,
    metadata,
    kind: "HANDOFF_ACKNOWLEDGEMENT",
    dueAt: handoffDue,
    partyId: metadata.delegate_party_id,
    instruction: handoffInstruction(metadata),
  });
  const returnReview = await ensureFollowUp({
    task,
    metadata,
    kind: "RETURN_TO_OWNER_REVIEW",
    dueAt: new Date(endMs).toISOString(),
    partyId: metadata.owner_party_id,
    instruction: returnInstruction(metadata),
  });
  return [handoff.id, returnReview.id];
}

export async function startSecretaryAbsenceCoverage({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const key = absenceKey(payload);
  const id = absenceTaskId(organization, key);
  const startsAt = iso(payload.starts_at || payload.startsAt, "starts_at", { required: true });
  const endsAt = iso(payload.ends_at || payload.endsAt, "ends_at", { required: true });
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error("SECRETARY_ABSENCE_WINDOW_INVALID");
  const owner = await assertParty(organization, payload.owner_party_id || payload.ownerPartyId || actor, "OWNER");
  const delegate = await assertParty(organization, payload.delegate_party_id || payload.delegatePartyId, "DELEGATE");
  if (owner.id === delegate.id) throw new Error("SECRETARY_ABSENCE_OWNER_AND_DELEGATE_MUST_DIFFER");
  const scopes = normalizeScopes(payload.coverage_scopes || payload.coverageScopes);
  const evidenceId = text(payload.instruction_evidence_id || payload.instructionEvidenceId || payload.evidence_id || payload.evidenceId, 300);
  const sourceReference = text(payload.source_reference || payload.sourceReference, 1600);
  if (!evidenceId) throw new Error("SECRETARY_ABSENCE_INSTRUCTION_EVIDENCE_REQUIRED");
  if (!sourceReference) throw new Error("SECRETARY_ABSENCE_SOURCE_REFERENCE_REQUIRED");

  let task = await one(supabaseAdmin.from("secretary_tasks").select("*").eq("organization_id", organization).eq("id", id).maybeSingle());
  if (!task) {
    const metadata = {
      secretary_role: "EXECUTIVE_SECRETARY",
      secretary_owned: true,
      secretary_absence_coverage: true,
      absence_contract: CONTRACT,
      absence_key: key,
      owner_party_id: owner.id,
      delegate_party_id: delegate.id,
      starts_at: startsAt,
      ends_at: endsAt,
      timezone: text(payload.timezone, 120) || text(context.timezone, 120) || "UTC",
      all_day: payload.all_day === true || payload.allDay === true,
      reason: text(payload.reason, 1200) || "Temporary absence",
      handoff_notes: text(payload.handoff_notes || payload.handoffNotes, 3000) || null,
      coverage_scopes: scopes,
      instruction_evidence_id: evidenceId,
      source_reference: sourceReference,
      coverage_status: temporalStatus({ starts_at: startsAt, ends_at: endsAt, coverage_status: "SCHEDULED" }),
      version: 1,
      revision_history: [],
      handoff_acknowledgement: null,
      owner_restored_at: null,
      existing_calendar_events_cancelled: false,
      platform_permissions_mutated: false,
      delegated_binding_authority_created: false,
      purchase_authority_created: false,
      payment_authority_created: false,
      signature_authority_created: false,
      legal_acceptance_authority_created: false,
      binding_submission_authority_created: false,
      fare_or_rate_acceptance_authority_created: false,
      external_authority_used: false,
    };
    const inserted = await supabaseAdmin.from("secretary_tasks").insert({
      id,
      organization_id: organization,
      entity_id: text(payload.entity_id || payload.entityId, 120) || context.entityId || null,
      owner_party_id: owner.id,
      contact_party_id: delegate.id,
      title: `Absence coverage: ${metadata.reason}`,
      details: `Temporary administrative coverage from ${startsAt} to ${endsAt}; scope-bounded and non-binding.`,
      status: "IN_PROGRESS",
      priority: "HIGH",
      due_at: endsAt,
      remind_at: startsAt,
      source: SOURCE,
      created_by_party_id: actor,
      metadata,
    }).select("*").single();
    if (inserted.error) {
      if (inserted.error.code !== "23505") throw inserted.error;
      task = await loadCoverageTask(organization, { coverage_id: id });
    } else task = inserted.data;
  }
  const block = await ensureCalendarBlock({ task, metadata: object(task.metadata) });
  const followUpIds = await materializeCoverageFollowUps(task);
  return {
    status: "coverage_registered",
    contract: CONTRACT,
    coverage_id: task.id,
    task,
    calendar_block: block,
    follow_up_ids: followUpIds,
    deterministic_coverage_id: task.id === id,
    existing_calendar_events_cancelled: false,
    platform_permissions_mutated: false,
    delegated_binding_authority_created: false,
    external_authority_used: false,
  };
}

export async function readSecretaryAbsenceCoverage({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const task = await loadCoverageTask(organization, payload);
  if (!task) throw new Error("SECRETARY_ABSENCE_COVERAGE_NOT_FOUND");
  const block = await one(
    supabaseAdmin.from("secretary_calendar_events").select("*")
      .eq("organization_id", organization).eq("id", absenceBlockId(task.id)).maybeSingle(),
  );
  const followUps = await many(
    supabaseAdmin.from("secretary_follow_ups").select("*")
      .eq("organization_id", organization).eq("task_id", task.id)
      .order("due_at", { ascending: true }).limit(500),
  );
  return {
    status: "read",
    contract: CONTRACT,
    coverage_id: task.id,
    task,
    calendar_block: block,
    temporal_status: temporalStatus(object(task.metadata)),
    follow_ups: followUps,
    coverage_scopes: list(object(task.metadata).coverage_scopes),
    platform_permissions_mutated: false,
    delegated_binding_authority_created: false,
    external_authority_used: false,
  };
}

export async function listSecretaryAbsenceCoverage({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  let query = supabaseAdmin.from("secretary_tasks")
    .select("*")
    .eq("organization_id", organization)
    .eq("source", SOURCE)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(Math.min(300, Math.max(1, Number(payload.limit || 100))));
  if (payload.include_cancelled !== true && payload.includeCancelled !== true) query = query.neq("status", "CANCELLED");
  if (text(payload.owner_party_id || payload.ownerPartyId, 120)) query = query.eq("owner_party_id", text(payload.owner_party_id || payload.ownerPartyId, 120));
  if (text(payload.delegate_party_id || payload.delegatePartyId, 120)) query = query.eq("contact_party_id", text(payload.delegate_party_id || payload.delegatePartyId, 120));
  const tasks = await many(query);
  const q = text(payload.query, 300).toLowerCase();
  const coverages = tasks.filter((task) => {
    if (!q) return true;
    const metadata = object(task.metadata);
    return [metadata.absence_key, metadata.reason, metadata.handoff_notes, ...list(metadata.coverage_scopes)]
      .some((value) => text(value, 1200).toLowerCase().includes(q));
  }).map((task) => ({
    coverage_id: task.id,
    owner_party_id: object(task.metadata).owner_party_id,
    delegate_party_id: object(task.metadata).delegate_party_id,
    starts_at: object(task.metadata).starts_at,
    ends_at: object(task.metadata).ends_at,
    coverage_status: object(task.metadata).coverage_status,
    temporal_status: temporalStatus(object(task.metadata)),
    coverage_scopes: list(object(task.metadata).coverage_scopes),
    reason: object(task.metadata).reason,
  }));
  return { status: "listed", contract: CONTRACT, count: coverages.length, coverages, external_authority_used: false };
}

export async function acknowledgeSecretaryAbsenceHandoff({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 300);
  if (!evidenceId) throw new Error("SECRETARY_ABSENCE_HANDOFF_EVIDENCE_REQUIRED");
  const changed = await mutateCoverageTask(organization, payload, async (_task, metadata) => {
    if (metadata.handoff_acknowledgement?.evidence_id === evidenceId) return { metadata, output: { acknowledgement: metadata.handoff_acknowledgement, idempotent: true, version: Number(metadata.version || 1) } };
    const acknowledgement = {
      evidence_id: evidenceId,
      source_reference: text(payload.source_reference || payload.sourceReference, 1600) || null,
      acknowledged_at: iso(payload.acknowledged_at || payload.acknowledgedAt, "acknowledged_at") || new Date().toISOString(),
      acknowledged_by_party_id: text(payload.acknowledged_by_party_id || payload.acknowledgedByPartyId, 120) || actor,
      notes: text(payload.notes, 1600) || null,
    };
    if (acknowledgement.acknowledged_by_party_id !== metadata.delegate_party_id) throw new Error("SECRETARY_ABSENCE_HANDOFF_ACKNOWLEDGEMENT_PARTY_MISMATCH");
    return { metadata: { ...metadata, handoff_acknowledgement: acknowledgement, external_authority_used: false }, output: { acknowledgement, idempotent: false, version: Number(metadata.version || 1) } };
  });
  const cancelled = await cancelCoverageFollowUps({ task: changed.task, version: changed.output.version, kinds: ["HANDOFF_ACKNOWLEDGEMENT"], reason: "Delegate handoff acknowledgement evidence recorded." });
  return {
    status: changed.output.idempotent ? "handoff_already_acknowledged" : "handoff_acknowledged",
    task: changed.task,
    acknowledgement: changed.output.acknowledgement,
    cancelled_follow_up_ids: cancelled,
    acknowledgement_grants_new_authority: false,
    platform_permissions_mutated: false,
    external_authority_used: false,
  };
}

export async function reviseSecretaryAbsenceCoverage({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 300);
  const sourceReference = text(payload.source_reference || payload.sourceReference, 1600);
  const reason = text(payload.revision_reason || payload.revisionReason || payload.reason, 1600);
  if (!evidenceId) throw new Error("SECRETARY_ABSENCE_REVISION_EVIDENCE_REQUIRED");
  if (!sourceReference) throw new Error("SECRETARY_ABSENCE_REVISION_SOURCE_REFERENCE_REQUIRED");
  if (!reason) throw new Error("SECRETARY_ABSENCE_REVISION_REASON_REQUIRED");

  const current = await loadCoverageTask(organization, payload);
  if (!current) throw new Error("SECRETARY_ABSENCE_COVERAGE_NOT_FOUND");
  const currentMetadata = object(current.metadata);
  const ownerId = currentMetadata.owner_party_id;
  const delegateId = text(payload.delegate_party_id || payload.delegatePartyId, 120) || currentMetadata.delegate_party_id;
  await assertParty(organization, delegateId, "DELEGATE");
  if (delegateId === ownerId) throw new Error("SECRETARY_ABSENCE_OWNER_AND_DELEGATE_MUST_DIFFER");
  const startsAt = payload.starts_at !== undefined || payload.startsAt !== undefined
    ? iso(payload.starts_at || payload.startsAt, "starts_at", { required: true })
    : currentMetadata.starts_at;
  const endsAt = payload.ends_at !== undefined || payload.endsAt !== undefined
    ? iso(payload.ends_at || payload.endsAt, "ends_at", { required: true })
    : currentMetadata.ends_at;
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error("SECRETARY_ABSENCE_WINDOW_INVALID");
  const scopes = payload.coverage_scopes !== undefined || payload.coverageScopes !== undefined
    ? normalizeScopes(payload.coverage_scopes || payload.coverageScopes)
    : list(currentMetadata.coverage_scopes);

  const changed = await mutateCoverageTask(organization, payload, async (_task, metadata) => {
    const revisions = list(metadata.revision_history);
    const duplicate = revisions.find((revision) => revision.evidence_id === evidenceId);
    if (duplicate) return { metadata, output: { revision: duplicate, idempotent: true, old_version: Number(metadata.version || 1), new_version: Number(metadata.version || 1) } };
    const oldVersion = Number(metadata.version || 1);
    const newVersion = oldVersion + 1;
    const revision = {
      revision: newVersion,
      previous: {
        delegate_party_id: metadata.delegate_party_id,
        starts_at: metadata.starts_at,
        ends_at: metadata.ends_at,
        coverage_scopes: list(metadata.coverage_scopes),
        reason: metadata.reason,
      },
      next: {
        delegate_party_id: delegateId,
        starts_at: startsAt,
        ends_at: endsAt,
        coverage_scopes: scopes,
        reason: text(payload.coverage_reason || payload.coverageReason, 1200) || metadata.reason,
      },
      evidence_id: evidenceId,
      source_reference: sourceReference,
      reason,
      revised_at: new Date().toISOString(),
      revised_by_party_id: actor,
      inferred: false,
    };
    const nextMetadata = {
      ...metadata,
      delegate_party_id: delegateId,
      starts_at: startsAt,
      ends_at: endsAt,
      coverage_scopes: scopes,
      reason: revision.next.reason,
      handoff_notes: payload.handoff_notes !== undefined || payload.handoffNotes !== undefined ? text(payload.handoff_notes || payload.handoffNotes, 3000) || null : metadata.handoff_notes,
      coverage_status: temporalStatus({ ...metadata, starts_at: startsAt, ends_at: endsAt, coverage_status: "SCHEDULED" }),
      version: newVersion,
      revision_history: [...revisions, revision].slice(-100),
      handoff_acknowledgement: delegateId === metadata.delegate_party_id ? metadata.handoff_acknowledgement : null,
      owner_restored_at: null,
      external_authority_used: false,
    };
    return {
      metadata: nextMetadata,
      task_patch: { contact_party_id: delegateId, due_at: endsAt, remind_at: startsAt, status: "IN_PROGRESS", completed_at: null },
      output: { revision, idempotent: false, old_version: oldVersion, new_version: newVersion },
    };
  });

  if (!changed.output.idempotent) {
    await cancelCoverageFollowUps({ task: changed.task, version: changed.output.old_version, reason: "Absence coverage revised from explicit evidence; prior handoff schedule fenced." });
  }
  const block = await reviseCalendarBlock({ task: changed.task, metadata: object(changed.task.metadata) });
  const followUpIds = await materializeCoverageFollowUps(changed.task);
  return {
    status: changed.output.idempotent ? "revision_already_recorded" : "coverage_revised",
    task: changed.task,
    revision: changed.output.revision,
    calendar_block: block,
    follow_up_ids: followUpIds,
    prior_coverage_preserved: true,
    platform_permissions_mutated: false,
    delegated_binding_authority_created: false,
    external_authority_used: false,
  };
}

export async function refreshSecretaryAbsenceCoverage({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const task = await loadCoverageTask(organization, payload);
  if (!task) throw new Error("SECRETARY_ABSENCE_COVERAGE_NOT_FOUND");
  const now = iso(payload.now, "now") || new Date().toISOString();
  const metadata = object(task.metadata);
  const temporal = temporalStatus(metadata, now);
  if (temporal === "EXPIRED" && metadata.coverage_status !== "EXPIRED") {
    const changed = await mutateCoverageTask(organization, payload, async (_current, currentMetadata) => ({
      metadata: { ...currentMetadata, coverage_status: "EXPIRED", owner_restored_at: now, external_authority_used: false },
      task_patch: { status: "DONE", completed_at: now },
    }));
    await setCalendarBlockStatus(changed.task, "COMPLETED");
    await cancelCoverageFollowUps({ task: changed.task, kinds: ["HANDOFF_ACKNOWLEDGEMENT"], reason: "Absence window expired; temporary coverage returned to owner." });
    return {
      status: "coverage_expired",
      task: changed.task,
      temporal_status: "EXPIRED",
      owner_restored: true,
      temporary_coverage_continues: false,
      platform_permissions_mutated: false,
      external_authority_used: false,
    };
  }
  if (["SCHEDULED", "ACTIVE"].includes(temporal) && metadata.coverage_status !== temporal) {
    const changed = await mutateCoverageTask(organization, payload, async (_current, currentMetadata) => ({
      metadata: { ...currentMetadata, coverage_status: temporal, external_authority_used: false },
    }));
    const followUpIds = await materializeCoverageFollowUps(changed.task, now);
    return { status: "coverage_refreshed", task: changed.task, temporal_status: temporal, follow_up_ids: followUpIds, external_authority_used: false };
  }
  const followUpIds = await materializeCoverageFollowUps(task, now);
  return { status: "coverage_refreshed", task, temporal_status: temporal, follow_up_ids: followUpIds, external_authority_used: false };
}

export async function endSecretaryAbsenceCoverageEarly({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 300);
  const reason = text(payload.reason, 1600);
  if (!evidenceId) throw new Error("SECRETARY_ABSENCE_EARLY_RETURN_EVIDENCE_REQUIRED");
  if (!reason) throw new Error("SECRETARY_ABSENCE_EARLY_RETURN_REASON_REQUIRED");
  const endedAt = iso(payload.ended_at || payload.endedAt, "ended_at") || new Date().toISOString();
  const changed = await mutateCoverageTask(organization, payload, async (_task, metadata) => {
    if (metadata.early_return_evidence?.evidence_id === evidenceId) return { metadata, output: { idempotent: true } };
    return {
      metadata: {
        ...metadata,
        coverage_status: "ENDED_EARLY",
        early_return_evidence: {
          evidence_id: evidenceId,
          source_reference: text(payload.source_reference || payload.sourceReference, 1600) || null,
          reason,
          ended_at: endedAt,
          recorded_by_party_id: actor,
        },
        owner_restored_at: endedAt,
        external_authority_used: false,
      },
      task_patch: { status: "DONE", completed_at: endedAt, due_at: endedAt },
      output: { idempotent: false },
    };
  });
  await setCalendarBlockStatus(changed.task, "CANCELLED");
  const cancelled = await cancelCoverageFollowUps({ task: changed.task, reason: "Owner returned early; temporary coverage ended and all pending absence follow-through was fenced." });
  return {
    status: changed.output.idempotent ? "early_return_already_recorded" : "coverage_ended_early",
    task: changed.task,
    cancelled_follow_up_ids: cancelled,
    owner_restored: true,
    temporary_coverage_continues: false,
    platform_permissions_mutated: false,
    delegated_binding_authority_created: false,
    external_authority_used: false,
  };
}

export async function cancelSecretaryAbsenceCoverage({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const reason = text(payload.reason, 1600) || "Secretary absence coverage cancelled before or during execution.";
  const changed = await mutateCoverageTask(organization, payload, async (_task, metadata) => ({
    metadata: {
      ...metadata,
      coverage_status: "CANCELLED",
      cancellation_reason: reason,
      owner_restored_at: new Date().toISOString(),
      external_authority_used: false,
    },
    task_patch: { status: "CANCELLED", completed_at: new Date().toISOString() },
  }));
  await setCalendarBlockStatus(changed.task, "CANCELLED");
  const cancelled = await cancelCoverageFollowUps({ task: changed.task, reason });
  return {
    status: "coverage_cancelled",
    task: changed.task,
    cancelled_follow_up_ids: cancelled,
    existing_calendar_events_cancelled: false,
    external_absence_cancelled: false,
    platform_permissions_mutated: false,
    delegated_binding_authority_created: false,
    external_authority_used: false,
  };
}

export default Object.freeze({
  start: startSecretaryAbsenceCoverage,
  read: readSecretaryAbsenceCoverage,
  list: listSecretaryAbsenceCoverage,
  acknowledgeHandoff: acknowledgeSecretaryAbsenceHandoff,
  revise: reviseSecretaryAbsenceCoverage,
  refresh: refreshSecretaryAbsenceCoverage,
  endEarly: endSecretaryAbsenceCoverageEarly,
  cancel: cancelSecretaryAbsenceCoverage,
});
