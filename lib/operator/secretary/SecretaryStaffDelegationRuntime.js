import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_STAFF_DELEGATION_V1";
const SOURCE = "secretary_staff_delegation";
const ACTIVE_STATES = new Set(["PENDING_ACCEPTANCE", "ACCEPTED", "IN_PROGRESS", "REJECTED", "OVERDUE_TEMPORALLY"]);

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
    if (required) throw new Error(`SECRETARY_STAFF_DELEGATION_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_STAFF_DELEGATION_${field.toUpperCase()}_INVALID`);
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

function assignmentTaskId(organization, canonicalOwnerPartyId, assigneePartyId, key) {
  return deterministicUuid(`avantiqo-secretary-staff-delegation-v1:${organization}:${canonicalOwnerPartyId}:${assigneePartyId}:${key}`);
}

function assignmentFollowUpId(taskId, partyId, kind, revision) {
  return deterministicUuid(`avantiqo-secretary-staff-delegation-follow-up-v1:${taskId}:${partyId || "owner"}:${kind}:${revision}`);
}

async function requireParty(organization, partyId, field = "ASSIGNEE") {
  const id = text(partyId, 120);
  if (!id) throw new Error(`SECRETARY_STAFF_DELEGATION_${field}_PARTY_REQUIRED`);
  const party = await one(
    supabaseAdmin.from("parties")
      .select("id,display_name,legal_name,email,phone,party_type,status,metadata")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!party) throw new Error(`SECRETARY_STAFF_DELEGATION_${field}_PARTY_NOT_FOUND`);
  if (text(party.status, 80).toUpperCase() === "INACTIVE") throw new Error(`SECRETARY_STAFF_DELEGATION_${field}_PARTY_INACTIVE`);
  return party;
}

async function contactActionType(organization, partyId) {
  const profile = await one(
    supabaseAdmin.from("secretary_contact_profiles")
      .select("preferred_channel,allow_messages")
      .eq("organization_id", organization)
      .eq("party_id", partyId)
      .maybeSingle(),
  );
  if (profile?.allow_messages === false) return "REVIEW";
  return text(profile?.preferred_channel, 120).toLowerCase().includes("email") ? "EMAIL" : "MESSAGE";
}

function defaultAcceptanceDeadline(now, dueAt) {
  const max = now.getTime() + 24 * 60 * 60 * 1000;
  const due = Date.parse(dueAt || "");
  return new Date(Number.isFinite(due) ? Math.min(max, due) : max).toISOString();
}

function defaultProgressCheck(now, acceptanceDueAt, dueAt) {
  const due = Date.parse(dueAt || "");
  if (!Number.isFinite(due) || due <= now.getTime()) return null;
  const start = Math.max(now.getTime(), Date.parse(acceptanceDueAt || "") || now.getTime());
  if (due <= start) return null;
  return new Date(start + Math.floor((due - start) / 2)).toISOString();
}

async function administrativeRouting({ organization, actor, instruction, at = new Date().toISOString() }) {
  const canonicalOwner = await resolveSecretaryCanonicalOwner({ organizationId: organization }) || actor;
  const routing = await resolveSecretaryAdministrativeCoverage({
    organizationId: organization,
    ownerPartyId: canonicalOwner,
    scope: "TASK_ROUTING",
    instruction,
    at,
    requiresOwnerAuthority: false,
  });
  if (routing.coverage_routing_review_required === true) {
    throw new Error(`SECRETARY_STAFF_DELEGATION_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  }
  const operational = routing.operational_assignee_party_id || canonicalOwner;
  if (actor !== canonicalOwner && actor !== operational) throw new Error("SECRETARY_STAFF_DELEGATION_ACTOR_NOT_AUTHORIZED");
  return { canonicalOwner, operational, routing };
}

function assignmentKey(payload, title, assigneePartyId, dueAt) {
  return text(
    payload.idempotency_key
      || payload.idempotencyKey
      || payload.source_reference
      || payload.sourceReference
      || `${title}|${assigneePartyId}|${dueAt || "NO_DUE_DATE"}`,
    2000,
  );
}

function assignmentMessage(task, assignee) {
  const metadata = object(task.metadata);
  return text([
    `Work assignment: ${task.title}.`,
    task.details ? `Details: ${task.details}.` : null,
    task.due_at ? `Due: ${task.due_at}.` : null,
    `Assigned to: ${text(assignee.display_name || assignee.legal_name || assignee.id, 300)}.`,
    "Please explicitly accept or reject this assignment.",
    "This is an administrative work assignment only. It does not grant platform permissions, approval authority, payment authority, signing authority, or other binding authority.",
    metadata.employment_relationship_inferred === false ? "The Secretary is not inferring an employment relationship from this assignment record." : null,
  ].filter(Boolean).join(" "), 4000);
}

function acceptanceChaseMessage(task) {
  return text([
    `Follow up once on the work assignment \"${task.title}\".`,
    "Ask the assignee to explicitly accept or reject the assignment.",
    task.due_at ? `Recorded task due date: ${task.due_at}.` : null,
    "Do not infer acceptance from silence, delivery, read status, or other activity.",
  ].filter(Boolean).join(" "), 4000);
}

function progressChaseMessage(task) {
  return text([
    `Request a factual progress update on the assigned work \"${task.title}\".`,
    task.due_at ? `Recorded due date: ${task.due_at}.` : null,
    "Ask for current status, blockers if any, and expected completion only if the assignee can state them explicitly.",
    "Do not infer performance, urgency, misconduct, completion, or delay reasons.",
  ].filter(Boolean).join(" "), 4000);
}

function overdueReviewMessage(task) {
  return text([
    `Review the delegated work \"${task.title}\" because its recorded due date has passed without completion evidence.`,
    task.due_at ? `Recorded due date: ${task.due_at}.` : null,
    "This is temporal overdue status only. Do not infer misconduct, poor performance, legal breach, or a reason for delay.",
  ].filter(Boolean).join(" "), 4000);
}

async function ensureFollowUp({ task, partyId, kind, revision, dueAt, actionType, instruction, executionReady }) {
  const id = assignmentFollowUpId(task.id, partyId, kind, revision);
  const existing = await one(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", task.organization_id)
      .eq("id", id)
      .maybeSingle(),
  );
  if (existing) return existing;
  const metadata = object(task.metadata);
  const inserted = await supabaseAdmin.from("secretary_follow_ups").insert({
    id,
    organization_id: task.organization_id,
    entity_id: task.entity_id || null,
    owner_party_id: metadata.canonical_owner_party_id || null,
    contact_party_id: partyId || null,
    task_id: task.id,
    action_type: actionType,
    reason: text(instruction, 4000),
    status: "PENDING",
    due_at: iso(dueAt, "follow_up_due_at", { required: true }),
    created_by_party_id: metadata.operational_assignee_party_id || metadata.canonical_owner_party_id || null,
    metadata: {
      execution_owner: executionReady ? "SECRETARY" : "EXECUTIVE",
      execution_ready: executionReady === true && ["MESSAGE", "EMAIL"].includes(actionType),
      execution_instruction: text(instruction, 4000),
      secretary_owned: true,
      secretary_staff_delegation: true,
      secretary_staff_delegation_contract: CONTRACT,
      secretary_staff_delegation_task_id: task.id,
      secretary_staff_delegation_kind: kind,
      secretary_staff_delegation_revision: revision,
      secretary_coverage_scope: executionReady ? "FOLLOW_UP_COORDINATION" : "TASK_ROUTING",
      canonical_owner_party_id: metadata.canonical_owner_party_id || null,
      operational_assignee_party_id: metadata.operational_assignee_party_id || null,
      assignee_party_id: metadata.assignee_party_id || null,
      acceptance_inferred: false,
      completion_inferred: false,
      urgency_inferred: false,
      misconduct_inferred: false,
      platform_permissions_mutated: false,
      binding_authority_delegated: false,
      approval_authority_delegated: false,
      external_authority_used: false,
    },
  }).select("*").single();
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      return one(
        supabaseAdmin.from("secretary_follow_ups")
          .select("*")
          .eq("organization_id", task.organization_id)
          .eq("id", id)
          .single(),
      );
    }
    throw inserted.error;
  }
  return inserted.data;
}

async function cancelPendingDelegationFollowUps({ task, partyId = null, kinds = null, reason }) {
  const rows = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,contact_party_id,metadata")
      .eq("organization_id", task.organization_id)
      .eq("task_id", task.id)
      .eq("status", "PENDING")
      .limit(500),
  );
  const allowedKinds = kinds ? new Set(kinds) : null;
  const ids = rows.filter((row) => {
    const metadata = object(row.metadata);
    if (metadata.secretary_staff_delegation !== true) return false;
    if (partyId && row.contact_party_id !== partyId) return false;
    if (allowedKinds && !allowedKinds.has(text(metadata.secretary_staff_delegation_kind, 120))) return false;
    return true;
  }).map((row) => row.id);
  if (!ids.length) return [];
  const now = new Date().toISOString();
  const update = await supabaseAdmin.from("secretary_follow_ups")
    .update({ status: "CANCELLED", result: text(reason, 1000), completed_at: now, updated_at: now })
    .eq("organization_id", task.organization_id)
    .in("id", ids);
  if (update.error) throw update.error;
  return ids;
}

async function loadTask(organization, taskId) {
  const id = text(taskId, 120);
  if (!id) throw new Error("SECRETARY_STAFF_DELEGATION_TASK_REQUIRED");
  const task = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!task || task.source !== SOURCE || object(task.metadata).secretary_staff_delegation !== true) {
    throw new Error("SECRETARY_STAFF_DELEGATION_NOT_FOUND");
  }
  return task;
}

async function mutateTask(organization, taskId, producer) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const task = await loadTask(organization, taskId);
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
  throw new Error("SECRETARY_STAFF_DELEGATION_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

async function materializeAssignmentFollowUps(task, assignee) {
  const metadata = object(task.metadata);
  const revision = Number(metadata.assignment_revision || 1);
  const actionType = await contactActionType(task.organization_id, assignee.id);
  const ids = [];
  const request = await ensureFollowUp({
    task,
    partyId: assignee.id,
    kind: "ASSIGNMENT_REQUEST",
    revision,
    dueAt: metadata.assigned_at || new Date().toISOString(),
    actionType,
    instruction: assignmentMessage(task, assignee),
    executionReady: ["MESSAGE", "EMAIL"].includes(actionType),
  });
  ids.push(request.id);
  if (metadata.acceptance_due_at) {
    const chase = await ensureFollowUp({
      task,
      partyId: assignee.id,
      kind: "ACCEPTANCE_CHASE",
      revision,
      dueAt: metadata.acceptance_due_at,
      actionType,
      instruction: acceptanceChaseMessage(task),
      executionReady: ["MESSAGE", "EMAIL"].includes(actionType),
    });
    ids.push(chase.id);
  }
  return ids;
}

async function materializeAcceptedFollowUps(task, assignee) {
  const metadata = object(task.metadata);
  const revision = Number(metadata.assignment_revision || 1);
  const actionType = await contactActionType(task.organization_id, assignee.id);
  const ids = [];
  if (metadata.progress_check_at) {
    const progress = await ensureFollowUp({
      task,
      partyId: assignee.id,
      kind: "PROGRESS_CHECK",
      revision: Number(metadata.progress_revision || 1),
      dueAt: metadata.progress_check_at,
      actionType,
      instruction: progressChaseMessage(task),
      executionReady: ["MESSAGE", "EMAIL"].includes(actionType),
    });
    ids.push(progress.id);
  }
  if (task.due_at) {
    const overdue = await ensureFollowUp({
      task,
      partyId: metadata.canonical_owner_party_id,
      kind: "OVERDUE_REVIEW",
      revision,
      dueAt: task.due_at,
      actionType: "REVIEW",
      instruction: overdueReviewMessage(task),
      executionReady: false,
    });
    ids.push(overdue.id);
  }
  return ids;
}

export async function delegateSecretaryStaffWork({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const title = text(payload.title || payload.objective, 500);
  if (!title) throw new Error("SECRETARY_STAFF_DELEGATION_TITLE_REQUIRED");
  const assignee = await requireParty(organization, payload.assignee_party_id || payload.assigneePartyId);
  const dueAt = iso(payload.due_at || payload.dueAt, "due_at");
  const now = new Date();
  if (dueAt && Date.parse(dueAt) <= now.getTime()) throw new Error("SECRETARY_STAFF_DELEGATION_DUE_AT_PAST");
  const routing = await administrativeRouting({ organization, actor, instruction: `Delegate routine work: ${title}` });
  const acceptanceDue = iso(payload.acceptance_due_at || payload.acceptanceDueAt, "acceptance_due_at") || defaultAcceptanceDeadline(now, dueAt);
  if (Date.parse(acceptanceDue) <= now.getTime()) throw new Error("SECRETARY_STAFF_DELEGATION_ACCEPTANCE_DUE_AT_PAST");
  const progressCheck = iso(payload.progress_check_at || payload.progressCheckAt, "progress_check_at") || defaultProgressCheck(now, acceptanceDue, dueAt);
  const key = assignmentKey(payload, title, assignee.id, dueAt);
  const id = assignmentTaskId(organization, routing.canonicalOwner, assignee.id, key);
  const existing = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (existing) return readSecretaryStaffDelegation({ context, payload: { task_id: existing.id } });

  const coverageMetadata = secretaryAdministrativeCoverageMetadata(routing.routing);
  const assignedAt = now.toISOString();
  const metadata = {
    secretary_role: "EXECUTIVE_SECRETARY",
    secretary_owned: true,
    secretary_staff_delegation: true,
    secretary_staff_delegation_contract: CONTRACT,
    assignment_state: "PENDING_ACCEPTANCE",
    assignment_revision: 1,
    progress_revision: 1,
    assignee_party_id: assignee.id,
    canonical_owner_party_id: routing.canonicalOwner,
    operational_assignee_party_id: routing.operational,
    assigned_at: assignedAt,
    assigned_by_party_id: actor,
    acceptance_due_at: acceptanceDue,
    acceptance_deadline_defaulted: !payload.acceptance_due_at && !payload.acceptanceDueAt,
    accepted_at: null,
    accepted_evidence_id: null,
    rejected_at: null,
    rejected_evidence_id: null,
    progress_check_at: progressCheck,
    progress_check_defaulted: Boolean(progressCheck && !payload.progress_check_at && !payload.progressCheckAt),
    progress_history: [],
    completion_evidence_id: null,
    assignment_history: [{
      event: "ASSIGNED",
      at: assignedAt,
      actor_party_id: actor,
      assignee_party_id: assignee.id,
      evidence_id: text(payload.evidence_id || payload.evidenceId, 300) || null,
    }],
    ...coverageMetadata,
    employment_relationship_inferred: false,
    acceptance_inferred: false,
    rejection_reason_inferred: false,
    completion_inferred: false,
    urgency_inferred: false,
    misconduct_inferred: false,
    performance_inferred: false,
    legal_breach_inferred: false,
    platform_permissions_mutated: false,
    binding_authority_delegated: false,
    approval_authority_delegated: false,
    external_authority_used: false,
  };
  const inserted = await supabaseAdmin.from("secretary_tasks").insert({
    id,
    organization_id: organization,
    entity_id: text(payload.entity_id || payload.entityId, 120) || context.entityId || null,
    owner_party_id: assignee.id,
    title,
    details: text(payload.details || payload.description, 4000) || null,
    status: "OPEN",
    priority: ["LOW", "NORMAL", "HIGH", "URGENT"].includes(text(payload.priority, 40).toUpperCase()) ? text(payload.priority, 40).toUpperCase() : "NORMAL",
    due_at: dueAt,
    remind_at: progressCheck || acceptanceDue,
    source: SOURCE,
    created_by_party_id: routing.operational,
    metadata,
  }).select("*").single();
  if (inserted.error) {
    if (inserted.error.code === "23505") return readSecretaryStaffDelegation({ context, payload: { task_id: id } });
    throw inserted.error;
  }
  const followUpIds = await materializeAssignmentFollowUps(inserted.data, assignee);
  const task = (await mutateTask(organization, id, async (current, currentMetadata) => ({
    metadata: { ...currentMetadata, assignment_follow_up_ids: followUpIds },
    output: {},
  }))).task;
  return {
    status: "delegated",
    contract: CONTRACT,
    task,
    assignee,
    assignment_follow_up_ids: followUpIds,
    deterministic_task_id: true,
    replay_safe: true,
    employment_relationship_inferred: false,
    acceptance_inferred: false,
    completion_inferred: false,
    external_authority_used: false,
  };
}

export async function readSecretaryStaffDelegation({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const task = await loadTask(organization, payload.task_id || payload.taskId || payload.id);
  const metadata = object(task.metadata);
  const followUps = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", organization)
      .eq("task_id", task.id)
      .order("created_at", { ascending: true })
      .limit(500),
  );
  return {
    status: "completed",
    contract: CONTRACT,
    task,
    assignment_state: metadata.assignment_state,
    assignee_party_id: metadata.assignee_party_id,
    canonical_owner_party_id: metadata.canonical_owner_party_id,
    follow_ups: followUps,
    temporal_overdue: Boolean(task.due_at && Date.parse(task.due_at) < Date.now() && !["DONE", "CANCELLED"].includes(task.status)),
    acceptance_inferred: false,
    completion_inferred: false,
    misconduct_inferred: false,
    external_authority_used: false,
  };
}

export async function listSecretaryStaffDelegations({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  let query = supabaseAdmin.from("secretary_tasks")
    .select("*")
    .eq("organization_id", organization)
    .eq("source", SOURCE)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(Math.min(300, Math.max(1, Number(payload.limit || 100))));
  if (payload.include_completed !== true && payload.includeCompleted !== true) query = query.in("status", ["OPEN", "IN_PROGRESS"]);
  if (text(payload.assignee_party_id || payload.assigneePartyId, 120)) query = query.eq("owner_party_id", text(payload.assignee_party_id || payload.assigneePartyId, 120));
  const tasks = await many(query);
  return {
    status: "completed",
    contract: CONTRACT,
    count: tasks.length,
    delegations: tasks.map((task) => ({
      task,
      assignment_state: object(task.metadata).assignment_state,
      temporal_overdue: Boolean(task.due_at && Date.parse(task.due_at) < Date.now() && !["DONE", "CANCELLED"].includes(task.status)),
    })),
    employment_relationship_inferred: false,
    performance_inferred: false,
    external_authority_used: false,
  };
}

export async function recordSecretaryStaffDelegationResponse({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const taskId = text(payload.task_id || payload.taskId, 120);
  const response = text(payload.response || payload.response_kind || payload.responseKind, 80).toUpperCase();
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 300);
  if (!["ACCEPTED", "REJECTED"].includes(response)) throw new Error("SECRETARY_STAFF_DELEGATION_RESPONSE_INVALID");
  if (!evidenceId) throw new Error("SECRETARY_STAFF_DELEGATION_RESPONSE_EVIDENCE_REQUIRED");
  const current = await loadTask(organization, taskId);
  const routing = await administrativeRouting({ organization, actor, instruction: `Record explicit staff delegation response for ${current.title}` });
  const assignee = await requireParty(organization, object(current.metadata).assignee_party_id);
  const now = new Date().toISOString();
  const mutation = await mutateTask(organization, taskId, async (task, metadata) => {
    if (!["PENDING_ACCEPTANCE", "REJECTED"].includes(metadata.assignment_state)) throw new Error("SECRETARY_STAFF_DELEGATION_RESPONSE_STATE_INVALID");
    const history = [...list(metadata.assignment_history), {
      event: response,
      at: now,
      actor_party_id: actor,
      assignee_party_id: assignee.id,
      evidence_id: evidenceId,
    }].slice(-100);
    if (response === "ACCEPTED") {
      return {
        metadata: {
          ...metadata,
          assignment_state: "ACCEPTED",
          accepted_at: now,
          accepted_evidence_id: evidenceId,
          rejected_at: null,
          rejected_evidence_id: null,
          assignment_history: history,
          canonical_owner_party_id: routing.canonicalOwner,
          operational_assignee_party_id: routing.operational,
          ...secretaryAdministrativeCoverageMetadata(routing.routing),
          acceptance_inferred: false,
          completion_inferred: false,
        },
        task_patch: { status: "IN_PROGRESS", owner_party_id: assignee.id, remind_at: metadata.progress_check_at || task.due_at || null },
        output: { response },
      };
    }
    return {
      metadata: {
        ...metadata,
        assignment_state: "REJECTED",
        rejected_at: now,
        rejected_evidence_id: evidenceId,
        accepted_at: null,
        accepted_evidence_id: null,
        assignment_history: history,
        canonical_owner_party_id: routing.canonicalOwner,
        operational_assignee_party_id: routing.operational,
        ...secretaryAdministrativeCoverageMetadata(routing.routing),
        rejection_reason_inferred: false,
        acceptance_inferred: false,
        completion_inferred: false,
      },
      task_patch: { status: "OPEN", owner_party_id: routing.canonicalOwner, remind_at: null },
      output: { response },
    };
  });
  await cancelPendingDelegationFollowUps({
    task: mutation.task,
    partyId: assignee.id,
    kinds: ["ASSIGNMENT_REQUEST", "ACCEPTANCE_CHASE"],
    reason: `Explicit assignment response recorded: ${response}`,
  });
  const followUpIds = [];
  if (response === "ACCEPTED") {
    followUpIds.push(...await materializeAcceptedFollowUps(mutation.task, assignee));
  } else {
    const review = await ensureFollowUp({
      task: mutation.task,
      partyId: routing.canonicalOwner,
      kind: "REASSIGNMENT_REVIEW",
      revision: Number(object(mutation.task.metadata).assignment_revision || 1),
      dueAt: now,
      actionType: "REVIEW",
      instruction: `Review the rejected work assignment \"${mutation.task.title}\" and decide whether to reassign, revise, or cancel it. The rejection reason is not inferred.`,
      executionReady: false,
    });
    followUpIds.push(review.id);
  }
  return {
    status: response === "ACCEPTED" ? "accepted" : "rejected",
    contract: CONTRACT,
    task: mutation.task,
    follow_up_ids: followUpIds,
    response_evidence_required: true,
    acceptance_inferred: false,
    rejection_reason_inferred: false,
    completion_inferred: false,
    external_authority_used: false,
  };
}

export async function recordSecretaryStaffDelegationProgress({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const taskId = text(payload.task_id || payload.taskId, 120);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 300);
  const progressNote = text(payload.progress_note || payload.progressNote, 4000);
  if (!evidenceId) throw new Error("SECRETARY_STAFF_DELEGATION_PROGRESS_EVIDENCE_REQUIRED");
  if (!progressNote) throw new Error("SECRETARY_STAFF_DELEGATION_PROGRESS_NOTE_REQUIRED");
  const current = await loadTask(organization, taskId);
  const routing = await administrativeRouting({ organization, actor, instruction: `Record evidence-backed staff progress for ${current.title}` });
  const assignee = await requireParty(organization, object(current.metadata).assignee_party_id);
  const now = new Date();
  const mutation = await mutateTask(organization, taskId, async (task, metadata) => {
    if (!["ACCEPTED", "IN_PROGRESS", "OVERDUE_TEMPORALLY"].includes(metadata.assignment_state)) throw new Error("SECRETARY_STAFF_DELEGATION_PROGRESS_STATE_INVALID");
    const nextDue = Date.parse(task.due_at || "");
    const nextProgress = Number.isFinite(nextDue) && nextDue > now.getTime()
      ? new Date(now.getTime() + Math.floor((nextDue - now.getTime()) / 2)).toISOString()
      : null;
    const progressRevision = Number(metadata.progress_revision || 1) + 1;
    return {
      metadata: {
        ...metadata,
        assignment_state: "IN_PROGRESS",
        progress_revision: progressRevision,
        progress_check_at: nextProgress,
        progress_history: [...list(metadata.progress_history), {
          at: now.toISOString(),
          evidence_id: evidenceId,
          note: progressNote,
          blocked: payload.blocked === true,
          blocker_text: payload.blocked === true ? text(payload.blocker_text || payload.blockerText, 3000) || null : null,
        }].slice(-100),
        last_progress_at: now.toISOString(),
        last_progress_evidence_id: evidenceId,
        canonical_owner_party_id: routing.canonicalOwner,
        operational_assignee_party_id: routing.operational,
        ...secretaryAdministrativeCoverageMetadata(routing.routing),
        performance_inferred: false,
        completion_inferred: false,
      },
      task_patch: { status: "IN_PROGRESS", remind_at: nextProgress || task.due_at || null },
      output: { next_progress_check_at: nextProgress, progress_revision: progressRevision },
    };
  });
  await cancelPendingDelegationFollowUps({
    task: mutation.task,
    partyId: assignee.id,
    kinds: ["PROGRESS_CHECK"],
    reason: "Progress evidence recorded",
  });
  const followUpIds = [];
  if (mutation.output.next_progress_check_at) {
    const next = await materializeAcceptedFollowUps(mutation.task, assignee);
    followUpIds.push(...next.filter((id) => id !== assignmentFollowUpId(mutation.task.id, routing.canonicalOwner, "OVERDUE_REVIEW", Number(object(mutation.task.metadata).assignment_revision || 1))));
  }
  return {
    status: "progress_recorded",
    contract: CONTRACT,
    task: mutation.task,
    follow_up_ids: followUpIds,
    progress_evidence_required: true,
    completion_inferred: false,
    performance_inferred: false,
    external_authority_used: false,
  };
}

export async function reassignSecretaryStaffWork({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const taskId = text(payload.task_id || payload.taskId, 120);
  const current = await loadTask(organization, taskId);
  const routing = await administrativeRouting({ organization, actor, instruction: `Reassign routine delegated work: ${current.title}` });
  const previousAssigneeId = text(object(current.metadata).assignee_party_id, 120);
  const nextAssignee = await requireParty(organization, payload.assignee_party_id || payload.assigneePartyId, "NEW_ASSIGNEE");
  if (nextAssignee.id === previousAssigneeId) throw new Error("SECRETARY_STAFF_DELEGATION_REASSIGNEE_UNCHANGED");
  const now = new Date();
  const acceptanceDue = iso(payload.acceptance_due_at || payload.acceptanceDueAt, "acceptance_due_at") || defaultAcceptanceDeadline(now, current.due_at);
  const progressCheck = iso(payload.progress_check_at || payload.progressCheckAt, "progress_check_at") || defaultProgressCheck(now, acceptanceDue, current.due_at);
  const revision = Number(object(current.metadata).assignment_revision || 1) + 1;
  await cancelPendingDelegationFollowUps({
    task: current,
    reason: "Assignment reassigned; stale pending follow-ups fenced",
  });
  const mutation = await mutateTask(organization, taskId, async (task, metadata) => ({
    metadata: {
      ...metadata,
      assignment_state: "PENDING_ACCEPTANCE",
      assignment_revision: revision,
      progress_revision: 1,
      assignee_party_id: nextAssignee.id,
      assigned_at: now.toISOString(),
      assigned_by_party_id: actor,
      acceptance_due_at: acceptanceDue,
      acceptance_deadline_defaulted: !payload.acceptance_due_at && !payload.acceptanceDueAt,
      accepted_at: null,
      accepted_evidence_id: null,
      rejected_at: null,
      rejected_evidence_id: null,
      progress_check_at: progressCheck,
      progress_check_defaulted: Boolean(progressCheck && !payload.progress_check_at && !payload.progressCheckAt),
      assignment_history: [...list(metadata.assignment_history), {
        event: "REASSIGNED",
        at: now.toISOString(),
        actor_party_id: actor,
        from_assignee_party_id: previousAssigneeId || null,
        assignee_party_id: nextAssignee.id,
        evidence_id: text(payload.evidence_id || payload.evidenceId, 300) || null,
        reason: text(payload.reason, 2000) || null,
      }].slice(-100),
      canonical_owner_party_id: routing.canonicalOwner,
      operational_assignee_party_id: routing.operational,
      ...secretaryAdministrativeCoverageMetadata(routing.routing),
      acceptance_inferred: false,
      rejection_reason_inferred: false,
      completion_inferred: false,
      platform_permissions_mutated: false,
      binding_authority_delegated: false,
      approval_authority_delegated: false,
      external_authority_used: false,
    },
    task_patch: { status: "OPEN", owner_party_id: nextAssignee.id, remind_at: progressCheck || acceptanceDue },
    output: {},
  }));
  const followUpIds = await materializeAssignmentFollowUps(mutation.task, nextAssignee);
  return {
    status: "reassigned",
    contract: CONTRACT,
    task: mutation.task,
    previous_assignee_party_id: previousAssigneeId || null,
    assignee_party_id: nextAssignee.id,
    assignment_follow_up_ids: followUpIds,
    stale_pending_follow_ups_fenced: true,
    canonical_owner_preserved: true,
    platform_permissions_mutated: false,
    binding_authority_delegated: false,
    approval_authority_delegated: false,
    external_authority_used: false,
  };
}

export async function completeSecretaryStaffDelegation({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const taskId = text(payload.task_id || payload.taskId, 120);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 300);
  if (!evidenceId) throw new Error("SECRETARY_STAFF_DELEGATION_COMPLETION_EVIDENCE_REQUIRED");
  const current = await loadTask(organization, taskId);
  const routing = await administrativeRouting({ organization, actor, instruction: `Record completion evidence for delegated work: ${current.title}` });
  const now = new Date().toISOString();
  const mutation = await mutateTask(organization, taskId, async (task, metadata) => {
    if (["DONE", "CANCELLED"].includes(task.status)) throw new Error("SECRETARY_STAFF_DELEGATION_ALREADY_TERMINAL");
    return {
      metadata: {
        ...metadata,
        assignment_state: "COMPLETED",
        completed_at: now,
        completion_evidence_id: evidenceId,
        completion_note: text(payload.completion_note || payload.completionNote, 4000) || null,
        assignment_history: [...list(metadata.assignment_history), {
          event: "COMPLETED",
          at: now,
          actor_party_id: actor,
          assignee_party_id: metadata.assignee_party_id || null,
          evidence_id: evidenceId,
        }].slice(-100),
        canonical_owner_party_id: routing.canonicalOwner,
        operational_assignee_party_id: routing.operational,
        ...secretaryAdministrativeCoverageMetadata(routing.routing),
        completion_inferred: false,
        performance_inferred: false,
      },
      task_patch: { status: "DONE", completed_at: now, remind_at: null },
      output: {},
    };
  });
  const cancelled = await cancelPendingDelegationFollowUps({
    task: mutation.task,
    reason: "Completion evidence recorded; pending delegation follow-ups fenced",
  });
  return {
    status: "completed",
    contract: CONTRACT,
    task: mutation.task,
    cancelled_follow_up_ids: cancelled,
    completion_evidence_required: true,
    completion_inferred: false,
    performance_inferred: false,
    external_authority_used: false,
  };
}

export async function refreshSecretaryStaffDelegation({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const taskId = text(payload.task_id || payload.taskId, 120);
  const now = iso(payload.now || payload.at || new Date().toISOString(), "refresh_at", { required: true });
  const current = await loadTask(organization, taskId);
  const routing = await administrativeRouting({ organization, actor, instruction: `Refresh routine delegated work control: ${current.title}`, at: now });
  const metadata = object(current.metadata);
  const assignee = metadata.assignee_party_id ? await requireParty(organization, metadata.assignee_party_id) : null;
  const created = [];
  const nowMs = Date.parse(now);
  if (metadata.assignment_state === "PENDING_ACCEPTANCE" && metadata.acceptance_due_at && nowMs >= Date.parse(metadata.acceptance_due_at) && assignee) {
    const actionType = await contactActionType(organization, assignee.id);
    const chase = await ensureFollowUp({
      task: current,
      partyId: assignee.id,
      kind: "ACCEPTANCE_CHASE",
      revision: Number(metadata.assignment_revision || 1),
      dueAt: metadata.acceptance_due_at,
      actionType,
      instruction: acceptanceChaseMessage(current),
      executionReady: ["MESSAGE", "EMAIL"].includes(actionType),
    });
    created.push(chase.id);
  }
  if (["ACCEPTED", "IN_PROGRESS"].includes(metadata.assignment_state) && metadata.progress_check_at && nowMs >= Date.parse(metadata.progress_check_at) && assignee) {
    const actionType = await contactActionType(organization, assignee.id);
    const progress = await ensureFollowUp({
      task: current,
      partyId: assignee.id,
      kind: "PROGRESS_CHECK",
      revision: Number(metadata.progress_revision || 1),
      dueAt: metadata.progress_check_at,
      actionType,
      instruction: progressChaseMessage(current),
      executionReady: ["MESSAGE", "EMAIL"].includes(actionType),
    });
    created.push(progress.id);
  }
  const overdue = Boolean(current.due_at && nowMs > Date.parse(current.due_at) && !["DONE", "CANCELLED"].includes(current.status));
  if (overdue) {
    const review = await ensureFollowUp({
      task: current,
      partyId: routing.canonicalOwner,
      kind: "OVERDUE_REVIEW",
      revision: Number(metadata.assignment_revision || 1),
      dueAt: current.due_at,
      actionType: "REVIEW",
      instruction: overdueReviewMessage(current),
      executionReady: false,
    });
    created.push(review.id);
  }
  const mutation = await mutateTask(organization, taskId, async (task, currentMetadata) => ({
    metadata: {
      ...currentMetadata,
      assignment_state: overdue && ACTIVE_STATES.has(currentMetadata.assignment_state) ? "OVERDUE_TEMPORALLY" : currentMetadata.assignment_state,
      temporal_overdue: overdue,
      last_refreshed_at: now,
      canonical_owner_party_id: routing.canonicalOwner,
      operational_assignee_party_id: routing.operational,
      ...secretaryAdministrativeCoverageMetadata(routing.routing),
      urgency_inferred: false,
      misconduct_inferred: false,
      performance_inferred: false,
      legal_breach_inferred: false,
      completion_inferred: false,
    },
    output: {},
  }));
  return {
    status: "refreshed",
    contract: CONTRACT,
    task: mutation.task,
    created_follow_up_ids: [...new Set(created)],
    temporal_overdue: overdue,
    urgency_inferred: false,
    misconduct_inferred: false,
    performance_inferred: false,
    legal_breach_inferred: false,
    completion_inferred: false,
    external_authority_used: false,
  };
}

export async function cancelSecretaryStaffDelegation({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const taskId = text(payload.task_id || payload.taskId, 120);
  const current = await loadTask(organization, taskId);
  if (current.status === "CANCELLED") return { status: "cancelled", contract: CONTRACT, task: current, replay_safe: true, external_authority_used: false };
  const routing = await administrativeRouting({ organization, actor, instruction: `Cancel routine delegated work: ${current.title}` });
  const cancelled = await cancelPendingDelegationFollowUps({ task: current, reason: text(payload.reason, 1000) || "Delegated work cancelled" });
  const now = new Date().toISOString();
  const mutation = await mutateTask(organization, taskId, async (task, metadata) => ({
    metadata: {
      ...metadata,
      assignment_state: "CANCELLED",
      cancelled_at: now,
      cancellation_reason: text(payload.reason, 2000) || null,
      assignment_history: [...list(metadata.assignment_history), {
        event: "CANCELLED",
        at: now,
        actor_party_id: actor,
        assignee_party_id: metadata.assignee_party_id || null,
      }].slice(-100),
      canonical_owner_party_id: routing.canonicalOwner,
      operational_assignee_party_id: routing.operational,
      ...secretaryAdministrativeCoverageMetadata(routing.routing),
      external_authority_used: false,
    },
    task_patch: { status: "CANCELLED", completed_at: now, remind_at: null },
    output: {},
  }));
  return {
    status: "cancelled",
    contract: CONTRACT,
    task: mutation.task,
    cancelled_follow_up_ids: cancelled,
    external_authority_used: false,
  };
}

export default Object.freeze({
  delegate: delegateSecretaryStaffWork,
  read: readSecretaryStaffDelegation,
  list: listSecretaryStaffDelegations,
  recordResponse: recordSecretaryStaffDelegationResponse,
  recordProgress: recordSecretaryStaffDelegationProgress,
  reassign: reassignSecretaryStaffWork,
  complete: completeSecretaryStaffDelegation,
  refresh: refreshSecretaryStaffDelegation,
  cancel: cancelSecretaryStaffDelegation,
});
