import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_CALL_SCREENING_V1";
const CONTACT_METADATA_KEY = "call_screening_v1";
const CALL_METADATA_KEY = "call_screening_v1";
const SOURCE = "secretary_call_screening";

const CONTACT_TIERS = new Set(["EXECUTIVE_PRIORITY", "STANDARD", "ROUTINE", "DO_NOT_INTERRUPT"]);
const INTERRUPT_MODES = new Set(["ALWAYS", "EXECUTIVE_DECISION_ONLY", "NEVER"]);
const CALLER_STATED_URGENCY = new Set(["EMERGENCY", "URGENT", "TIME_SENSITIVE", "ROUTINE"]);
const DISPOSITIONS = new Set([
  "SECRETARY_HANDLED",
  "CALLBACK_COMPLETED",
  "MESSAGE_RECORDED",
  "EXECUTIVE_REVIEWED",
  "REFERRED",
  "NO_ACTION_REQUIRED",
  "CALLER_DISCONNECTED",
]);

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
    if (required) throw new Error(`SECRETARY_CALL_SCREENING_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_CALL_SCREENING_${field.toUpperCase()}_INVALID`);
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

async function assertParty(organization, partyId) {
  const id = text(partyId, 120);
  if (!id) throw new Error("SECRETARY_CALL_SCREENING_CONTACT_PARTY_REQUIRED");
  const party = await one(
    supabaseAdmin.from("parties")
      .select("id,display_name,email,phone,party_type,status")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!party) throw new Error("SECRETARY_CALL_SCREENING_CONTACT_PARTY_NOT_FOUND");
  return party;
}

async function ensureContactProfile(organization, partyId) {
  let profile = await one(
    supabaseAdmin.from("secretary_contact_profiles")
      .select("*")
      .eq("organization_id", organization)
      .eq("party_id", partyId)
      .maybeSingle(),
  );
  if (profile) return profile;
  const inserted = await supabaseAdmin.from("secretary_contact_profiles").insert({
    organization_id: organization,
    party_id: partyId,
    metadata: {},
  }).select("*").single();
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      return one(
        supabaseAdmin.from("secretary_contact_profiles").select("*")
          .eq("organization_id", organization).eq("party_id", partyId).single(),
      );
    }
    throw inserted.error;
  }
  return inserted.data;
}

async function mutateContactProfile(organization, partyId, producer) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const profile = await ensureContactProfile(organization, partyId);
    const produced = await producer(profile, object(profile.metadata));
    const update = await supabaseAdmin.from("secretary_contact_profiles")
      .update({ metadata: produced.metadata, updated_at: new Date().toISOString() })
      .eq("organization_id", organization)
      .eq("party_id", partyId)
      .eq("updated_at", profile.updated_at)
      .select("*")
      .maybeSingle();
    if (update.error) throw update.error;
    if (update.data) return { profile: update.data, output: object(produced.output) };
  }
  throw new Error("SECRETARY_CALL_SCREENING_CONTACT_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

async function loadCall(organization, callId) {
  const id = text(callId, 120);
  if (!id) throw new Error("SECRETARY_CALL_SCREENING_CALL_REQUIRED");
  const call = await one(
    supabaseAdmin.from("secretary_calls")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!call) throw new Error("SECRETARY_CALL_SCREENING_CALL_NOT_FOUND");
  return call;
}

async function mutateCall(organization, callId, producer) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const call = await loadCall(organization, callId);
    const produced = await producer(call, object(call.metadata));
    const update = await supabaseAdmin.from("secretary_calls")
      .update({ metadata: produced.metadata, updated_at: new Date().toISOString() })
      .eq("organization_id", organization)
      .eq("id", call.id)
      .eq("updated_at", call.updated_at)
      .select("*")
      .maybeSingle();
    if (update.error) throw update.error;
    if (update.data) return { call: update.data, output: object(produced.output) };
  }
  throw new Error("SECRETARY_CALL_SCREENING_CALL_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

function normalizeCallbackWindow(value) {
  const window = object(value);
  if (!Object.keys(window).length) return null;
  const timezone = text(window.timezone, 120);
  const startLocal = text(window.start_local || window.startLocal, 10);
  const endLocal = text(window.end_local || window.endLocal, 10);
  if (!timezone || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startLocal) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endLocal)) {
    throw new Error("SECRETARY_CALL_SCREENING_CALLBACK_WINDOW_INVALID");
  }
  if (startLocal === endLocal) throw new Error("SECRETARY_CALL_SCREENING_CALLBACK_WINDOW_INVALID");
  return { timezone, start_local: startLocal, end_local: endLocal };
}

function currentContactHandling(profile) {
  return object(object(profile?.metadata)[CONTACT_METADATA_KEY]).current || null;
}

function screeningId(callId, evidenceId) {
  return deterministicUuid(`avantiqo-secretary-call-screening-v1:${callId}:${evidenceId}`);
}

function routingTaskId(callId, screeningIdValue) {
  return deterministicUuid(`avantiqo-secretary-call-screening-task-v1:${callId}:${screeningIdValue}`);
}

function callbackFollowUpId(callId, screeningIdValue) {
  return deterministicUuid(`avantiqo-secretary-call-screening-callback-v1:${callId}:${screeningIdValue}`);
}

function normalizeCallerStatedUrgency(value) {
  const normalized = text(value, 80).toUpperCase();
  if (!normalized) return null;
  if (!CALLER_STATED_URGENCY.has(normalized)) throw new Error("SECRETARY_CALL_SCREENING_CALLER_STATED_URGENCY_INVALID");
  return normalized;
}

function decideRoute({ handling, callerStatedUrgency, executiveDecisionRequired, highAuthorityRequest, callbackRequested, secretaryCanResolve, messageOnly }) {
  const interruptMode = text(handling?.interrupt_mode, 80).toUpperCase();
  if (interruptMode === "ALWAYS") {
    return { route: "INTERRUPT_EXECUTIVE", priority: "URGENT", reason: "EXPLICIT_CONTACT_INTERRUPT_RULE" };
  }
  if (interruptMode === "EXECUTIVE_DECISION_ONLY" && executiveDecisionRequired) {
    return { route: "INTERRUPT_EXECUTIVE", priority: "URGENT", reason: "EXPLICIT_CONTACT_DECISION_INTERRUPT_RULE" };
  }
  if (highAuthorityRequest || executiveDecisionRequired) {
    return { route: "EXECUTIVE_REVIEW", priority: "HIGH", reason: highAuthorityRequest ? "HIGH_AUTHORITY_REQUEST" : "EXECUTIVE_DECISION_REQUIRED" };
  }
  if (["EMERGENCY", "URGENT"].includes(callerStatedUrgency)) {
    return { route: "EXECUTIVE_REVIEW", priority: "HIGH", reason: "CALLER_STATED_URGENCY_UNVERIFIED" };
  }
  if (callbackRequested) return { route: "CALLBACK", priority: "NORMAL", reason: "CALLBACK_REQUESTED" };
  if (secretaryCanResolve) return { route: "SECRETARY_HANDLE", priority: "LOW", reason: "SECRETARY_CAN_RESOLVE" };
  if (messageOnly) return { route: "MESSAGE", priority: "NORMAL", reason: "MESSAGE_ONLY" };
  return { route: "REVIEW", priority: "NORMAL", reason: "INSUFFICIENT_ROUTING_EVIDENCE" };
}

async function ownerPartyIdForCall(call, actor) {
  if (!call.phone_line_id) return actor;
  const line = await one(
    supabaseAdmin.from("secretary_phone_lines")
      .select("owner_party_id")
      .eq("organization_id", call.organization_id)
      .eq("id", call.phone_line_id)
      .maybeSingle(),
  );
  return text(line?.owner_party_id, 120) || actor;
}

async function ensureRoutingTask({ call, screening, ownerPartyId }) {
  if (!["INTERRUPT_EXECUTIVE", "EXECUTIVE_REVIEW", "MESSAGE", "REVIEW"].includes(screening.route)) return null;
  const id = routingTaskId(call.id, screening.id);
  const existing = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", call.organization_id)
      .eq("id", id)
      .maybeSingle(),
  );
  if (existing) return existing;
  const title = screening.route === "INTERRUPT_EXECUTIVE"
    ? "Call screening: immediate executive attention"
    : screening.route === "EXECUTIVE_REVIEW"
      ? "Call screening: executive review"
      : screening.route === "MESSAGE"
        ? "Call screening: message review"
        : "Call screening: review required";
  const inserted = await supabaseAdmin.from("secretary_tasks").insert({
    id,
    organization_id: call.organization_id,
    entity_id: call.entity_id || null,
    owner_party_id: ownerPartyId,
    contact_party_id: call.contact_party_id || null,
    title,
    details: screening.caller_request || `Screening route ${screening.route} for call ${call.id}.`,
    status: "OPEN",
    priority: screening.priority,
    due_at: screening.screened_at,
    remind_at: screening.screened_at,
    source: SOURCE,
    created_by_party_id: screening.screened_by_party_id,
    metadata: {
      secretary_owned: true,
      secretary_call_screening: true,
      call_id: call.id,
      screening_id: screening.id,
      route: screening.route,
      routing_reason: screening.routing_reason,
      caller_stated_urgency: screening.caller_stated_urgency,
      urgency_verified: false,
      vip_inferred: false,
      executive_interruption_authority_created: false,
      external_authority_used: false,
    },
  }).select("*").single();
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      return one(supabaseAdmin.from("secretary_tasks").select("*").eq("organization_id", call.organization_id).eq("id", id).single());
    }
    throw inserted.error;
  }
  return inserted.data;
}

async function ensureCallbackFollowUp({ call, screening, ownerPartyId }) {
  if (screening.route !== "CALLBACK") return null;
  if (!screening.callback_due_at) throw new Error("SECRETARY_CALL_SCREENING_CALLBACK_DUE_AT_REQUIRED");
  const id = callbackFollowUpId(call.id, screening.id);
  const existing = await one(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", call.organization_id)
      .eq("id", id)
      .maybeSingle(),
  );
  if (existing) return existing;
  const reason = screening.caller_request || "Return screened caller's call.";
  const inserted = await supabaseAdmin.from("secretary_follow_ups").insert({
    id,
    organization_id: call.organization_id,
    entity_id: call.entity_id || null,
    owner_party_id: ownerPartyId,
    contact_party_id: call.contact_party_id || null,
    call_id: call.id,
    action_type: "CALL",
    reason,
    status: "PENDING",
    due_at: screening.callback_due_at,
    created_by_party_id: screening.screened_by_party_id,
    metadata: {
      execution_owner: "SECRETARY",
      execution_ready: true,
      execution_instruction: reason,
      secretary_owned: true,
      secretary_call_screening: true,
      call_id: call.id,
      screening_id: screening.id,
      callback_due_at_explicit: true,
      vip_inferred: false,
      urgency_inferred: false,
      external_authority_used: false,
    },
  }).select("*").single();
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      return one(supabaseAdmin.from("secretary_follow_ups").select("*").eq("organization_id", call.organization_id).eq("id", id).single());
    }
    throw inserted.error;
  }
  return inserted.data;
}

async function cancelPendingRouting({ call, screeningIdValue, disposition }) {
  const now = new Date().toISOString();
  const taskId = routingTaskId(call.id, screeningIdValue);
  const taskResult = await supabaseAdmin.from("secretary_tasks")
    .update({ status: "DONE", completed_at: now, updated_at: now })
    .eq("organization_id", call.organization_id)
    .eq("id", taskId)
    .in("status", ["OPEN", "IN_PROGRESS"]);
  if (taskResult.error) throw taskResult.error;

  if (disposition === "CALLBACK_COMPLETED") {
    const followUpId = callbackFollowUpId(call.id, screeningIdValue);
    const followUpResult = await supabaseAdmin.from("secretary_follow_ups")
      .update({ status: "COMPLETED", completed_at: now, result: "Callback completion evidence recorded.", updated_at: now })
      .eq("organization_id", call.organization_id)
      .eq("id", followUpId)
      .eq("status", "PENDING");
    if (followUpResult.error) throw followUpResult.error;
  }
}

export async function setSecretaryContactCallHandling({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const party = await assertParty(organization, payload.party_id || payload.partyId);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 300);
  const sourceReference = text(payload.source_reference || payload.sourceReference, 1600);
  if (!evidenceId) throw new Error("SECRETARY_CALL_SCREENING_CONTACT_EVIDENCE_REQUIRED");
  if (!sourceReference) throw new Error("SECRETARY_CALL_SCREENING_CONTACT_SOURCE_REFERENCE_REQUIRED");
  const tier = text(payload.tier, 80).toUpperCase();
  const interruptMode = text(payload.interrupt_mode || payload.interruptMode, 80).toUpperCase();
  if (!CONTACT_TIERS.has(tier)) throw new Error("SECRETARY_CALL_SCREENING_CONTACT_TIER_INVALID");
  if (!INTERRUPT_MODES.has(interruptMode)) throw new Error("SECRETARY_CALL_SCREENING_INTERRUPT_MODE_INVALID");
  if (tier === "DO_NOT_INTERRUPT" && interruptMode !== "NEVER") throw new Error("SECRETARY_CALL_SCREENING_DO_NOT_INTERRUPT_CONFLICT");
  const callbackWindow = normalizeCallbackWindow(payload.callback_window || payload.callbackWindow);

  const changed = await mutateContactProfile(organization, party.id, async (_profile, metadata) => {
    const state = object(metadata[CONTACT_METADATA_KEY]);
    const current = object(state.current);
    if (current.evidence_id === evidenceId) return { metadata, output: { handling: current, idempotent: true } };
    const history = list(state.history);
    const now = new Date().toISOString();
    const handling = {
      tier,
      interrupt_mode: interruptMode,
      callback_window: callbackWindow,
      notes: text(payload.notes, 2000) || null,
      evidence_id: evidenceId,
      source_reference: sourceReference,
      recorded_at: now,
      recorded_by_party_id: actor,
      status: "CURRENT",
      explicit_not_inferred: true,
      vip_inferred: false,
      urgency_inferred: false,
      external_authority_used: false,
    };
    const nextHistory = current.evidence_id
      ? [...history, { ...current, status: "SUPERSEDED", superseded_at: now }].slice(-100)
      : history;
    return {
      metadata: {
        ...metadata,
        [CONTACT_METADATA_KEY]: {
          contract: CONTRACT,
          current: handling,
          history: nextHistory,
          vip_inferred: false,
          urgency_inferred: false,
          external_authority_used: false,
        },
      },
      output: { handling, idempotent: false },
    };
  });

  return {
    status: changed.output.idempotent ? "contact_handling_already_recorded" : "contact_handling_recorded",
    contract: CONTRACT,
    profile: changed.profile,
    handling: changed.output.handling,
    idempotent: changed.output.idempotent,
    vip_inferred: false,
    urgency_inferred: false,
    external_authority_used: false,
  };
}

export async function clearSecretaryContactCallHandling({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const party = await assertParty(organization, payload.party_id || payload.partyId);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 300);
  const sourceReference = text(payload.source_reference || payload.sourceReference, 1600);
  const reason = text(payload.reason, 1600);
  if (!evidenceId) throw new Error("SECRETARY_CALL_SCREENING_CONTACT_CLEAR_EVIDENCE_REQUIRED");
  if (!sourceReference) throw new Error("SECRETARY_CALL_SCREENING_CONTACT_CLEAR_SOURCE_REFERENCE_REQUIRED");
  if (!reason) throw new Error("SECRETARY_CALL_SCREENING_CONTACT_CLEAR_REASON_REQUIRED");

  const changed = await mutateContactProfile(organization, party.id, async (_profile, metadata) => {
    const state = object(metadata[CONTACT_METADATA_KEY]);
    const current = object(state.current);
    const history = list(state.history);
    const priorClear = history.find((item) => item.clear_evidence_id === evidenceId);
    if (!current.evidence_id && priorClear) return { metadata, output: { cleared: priorClear, idempotent: true } };
    if (!current.evidence_id) throw new Error("SECRETARY_CALL_SCREENING_CONTACT_HANDLING_NOT_FOUND");
    const now = new Date().toISOString();
    const cleared = {
      ...current,
      status: "CLEARED",
      cleared_at: now,
      cleared_by_party_id: actor,
      clear_evidence_id: evidenceId,
      clear_source_reference: sourceReference,
      clear_reason: reason,
    };
    return {
      metadata: {
        ...metadata,
        [CONTACT_METADATA_KEY]: {
          ...state,
          contract: CONTRACT,
          current: null,
          history: [...history, cleared].slice(-100),
          vip_inferred: false,
          urgency_inferred: false,
          external_authority_used: false,
        },
      },
      output: { cleared, idempotent: false },
    };
  });
  return {
    status: changed.output.idempotent ? "contact_handling_already_cleared" : "contact_handling_cleared",
    profile: changed.profile,
    cleared_handling: changed.output.cleared,
    idempotent: changed.output.idempotent,
    history_preserved: true,
    external_authority_used: false,
  };
}

export async function readSecretaryContactCallHandling({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const party = await assertParty(organization, payload.party_id || payload.partyId);
  const profile = await ensureContactProfile(organization, party.id);
  const state = object(object(profile.metadata)[CONTACT_METADATA_KEY]);
  return {
    status: "read",
    contract: CONTRACT,
    party,
    current: state.current || null,
    history: list(state.history),
    vip_inferred: false,
    urgency_inferred: false,
    external_authority_used: false,
  };
}

export async function screenSecretaryCall({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const call = await loadCall(organization, payload.call_id || payload.callId);
  if (text(call.direction, 40).toUpperCase() !== "INBOUND") throw new Error("SECRETARY_CALL_SCREENING_INBOUND_CALL_REQUIRED");
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 300);
  const sourceReference = text(payload.source_reference || payload.sourceReference, 1600);
  if (!evidenceId) throw new Error("SECRETARY_CALL_SCREENING_EVIDENCE_REQUIRED");
  if (!sourceReference) throw new Error("SECRETARY_CALL_SCREENING_SOURCE_REFERENCE_REQUIRED");
  const id = screeningId(call.id, evidenceId);
  const callerStatedUrgency = normalizeCallerStatedUrgency(payload.caller_stated_urgency || payload.callerStatedUrgency);
  const executiveDecisionRequired = payload.executive_decision_required === true || payload.executiveDecisionRequired === true;
  const highAuthorityRequest = payload.high_authority_request === true || payload.highAuthorityRequest === true;
  const callbackRequested = payload.callback_requested === true || payload.callbackRequested === true;
  const secretaryCanResolve = payload.secretary_can_resolve === true || payload.secretaryCanResolve === true;
  const messageOnly = payload.message_only === true || payload.messageOnly === true;
  const callbackDueAt = iso(payload.callback_due_at || payload.callbackDueAt, "callback_due_at");
  if (callbackRequested && !callbackDueAt) throw new Error("SECRETARY_CALL_SCREENING_CALLBACK_DUE_AT_REQUIRED");

  let handling = null;
  if (call.contact_party_id) {
    const profile = await ensureContactProfile(organization, call.contact_party_id);
    handling = currentContactHandling(profile);
  }
  const routeDecision = decideRoute({
    handling,
    callerStatedUrgency,
    executiveDecisionRequired,
    highAuthorityRequest,
    callbackRequested,
    secretaryCanResolve,
    messageOnly,
  });
  const screenedAt = iso(payload.screened_at || payload.screenedAt, "screened_at") || new Date().toISOString();

  const changed = await mutateCall(organization, call.id, async (_call, metadata) => {
    const state = object(metadata[CALL_METADATA_KEY]);
    const screenings = list(state.screenings);
    const existing = screenings.find((item) => item.id === id || item.evidence_id === evidenceId);
    if (existing) return { metadata, output: { screening: existing, idempotent: true } };
    const screening = {
      id,
      evidence_id: evidenceId,
      source_reference: sourceReference,
      screened_at: screenedAt,
      screened_by_party_id: actor,
      contact_party_id: call.contact_party_id || null,
      caller_request: text(payload.caller_request || payload.callerRequest, 4000) || null,
      caller_stated_urgency: callerStatedUrgency,
      urgency_verified: false,
      objective_emergency_inferred: false,
      executive_decision_required: executiveDecisionRequired,
      high_authority_request: highAuthorityRequest,
      callback_requested: callbackRequested,
      callback_due_at: callbackDueAt,
      secretary_can_resolve: secretaryCanResolve,
      message_only: messageOnly,
      route: routeDecision.route,
      priority: routeDecision.priority,
      routing_reason: routeDecision.reason,
      contact_handling_evidence_id: text(handling?.evidence_id, 300) || null,
      contact_tier: text(handling?.tier, 80) || null,
      interrupt_mode: text(handling?.interrupt_mode, 80) || null,
      vip_inferred: false,
      urgency_inferred: false,
      executive_interruption_authority_created: false,
      external_authority_used: false,
      status: "OPEN",
      disposition: null,
    };
    return {
      metadata: {
        ...metadata,
        [CALL_METADATA_KEY]: {
          contract: CONTRACT,
          screenings: [...screenings, screening].slice(-100),
          vip_inferred: false,
          urgency_inferred: false,
          external_authority_used: false,
        },
      },
      output: { screening, idempotent: false },
    };
  });

  const owner = await ownerPartyIdForCall(changed.call, actor);
  const routingTask = await ensureRoutingTask({ call: changed.call, screening: changed.output.screening, ownerPartyId: owner });
  const callbackFollowUp = await ensureCallbackFollowUp({ call: changed.call, screening: changed.output.screening, ownerPartyId: owner });
  return {
    status: changed.output.idempotent ? "screening_already_recorded" : "screened",
    contract: CONTRACT,
    call_id: changed.call.id,
    screening: changed.output.screening,
    idempotent: changed.output.idempotent,
    routing_task: routingTask,
    callback_follow_up: callbackFollowUp,
    vip_inferred: false,
    urgency_inferred: false,
    objective_emergency_inferred: false,
    external_authority_used: false,
  };
}

export async function readSecretaryCallScreening({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const call = await loadCall(organization, payload.call_id || payload.callId);
  const state = object(object(call.metadata)[CALL_METADATA_KEY]);
  const screenings = list(state.screenings);
  const screeningIdValue = text(payload.screening_id || payload.screeningId, 120);
  const selected = screeningIdValue ? screenings.find((item) => item.id === screeningIdValue) || null : screenings.at(-1) || null;
  const tasks = await many(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("source", SOURCE)
      .eq("metadata->>call_id", call.id)
      .order("created_at", { ascending: true })
      .limit(100),
  );
  const followUps = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", organization)
      .eq("call_id", call.id)
      .contains("metadata", { secretary_call_screening: true })
      .order("created_at", { ascending: true })
      .limit(100),
  );
  return {
    status: "read",
    contract: CONTRACT,
    call,
    screening: selected,
    screenings,
    routing_tasks: tasks,
    callback_follow_ups: followUps,
    vip_inferred: false,
    urgency_inferred: false,
    external_authority_used: false,
  };
}

export async function listSecretaryCallScreeningAttention({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const maxRows = Math.max(1, Math.min(300, Number(payload.limit || 100)));
  let query = supabaseAdmin.from("secretary_tasks")
    .select("*")
    .eq("organization_id", organization)
    .eq("source", SOURCE)
    .in("status", ["OPEN", "IN_PROGRESS"])
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(maxRows);
  if (text(payload.route, 80)) query = query.eq("metadata->>route", text(payload.route, 80).toUpperCase());
  const tasks = await many(query);
  return {
    status: "listed",
    contract: CONTRACT,
    count: tasks.length,
    attention: tasks,
    vip_inferred: false,
    urgency_inferred: false,
    external_authority_used: false,
  };
}

export async function recordSecretaryCallScreeningDisposition({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const callId = text(payload.call_id || payload.callId, 120);
  const screeningIdValue = text(payload.screening_id || payload.screeningId, 120);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 300);
  const sourceReference = text(payload.source_reference || payload.sourceReference, 1600);
  const disposition = text(payload.disposition, 80).toUpperCase();
  if (!callId) throw new Error("SECRETARY_CALL_SCREENING_CALL_REQUIRED");
  if (!screeningIdValue) throw new Error("SECRETARY_CALL_SCREENING_SCREENING_ID_REQUIRED");
  if (!evidenceId) throw new Error("SECRETARY_CALL_SCREENING_DISPOSITION_EVIDENCE_REQUIRED");
  if (!sourceReference) throw new Error("SECRETARY_CALL_SCREENING_DISPOSITION_SOURCE_REFERENCE_REQUIRED");
  if (!DISPOSITIONS.has(disposition)) throw new Error("SECRETARY_CALL_SCREENING_DISPOSITION_INVALID");

  const changed = await mutateCall(organization, callId, async (_call, metadata) => {
    const state = object(metadata[CALL_METADATA_KEY]);
    const screenings = list(state.screenings);
    const target = screenings.find((item) => item.id === screeningIdValue);
    if (!target) throw new Error("SECRETARY_CALL_SCREENING_RECORD_NOT_FOUND");
    if (target.disposition?.evidence_id === evidenceId) return { metadata, output: { screening: target, idempotent: true } };
    const now = new Date().toISOString();
    const next = {
      ...target,
      status: "RESOLVED",
      disposition: {
        disposition,
        evidence_id: evidenceId,
        source_reference: sourceReference,
        notes: text(payload.notes, 2000) || null,
        recorded_at: now,
        recorded_by_party_id: actor,
      },
    };
    return {
      metadata: {
        ...metadata,
        [CALL_METADATA_KEY]: {
          ...state,
          contract: CONTRACT,
          screenings: screenings.map((item) => item.id === screeningIdValue ? next : item),
          vip_inferred: false,
          urgency_inferred: false,
          external_authority_used: false,
        },
      },
      output: { screening: next, idempotent: false },
    };
  });
  await cancelPendingRouting({ call: changed.call, screeningIdValue, disposition });
  return {
    status: changed.output.idempotent ? "disposition_already_recorded" : "disposition_recorded",
    contract: CONTRACT,
    call_id: changed.call.id,
    screening: changed.output.screening,
    idempotent: changed.output.idempotent,
    vip_inferred: false,
    urgency_inferred: false,
    external_authority_used: false,
  };
}

export default Object.freeze({
  setContactHandling: setSecretaryContactCallHandling,
  clearContactHandling: clearSecretaryContactCallHandling,
  readContactHandling: readSecretaryContactCallHandling,
  screen: screenSecretaryCall,
  read: readSecretaryCallScreening,
  listAttention: listSecretaryCallScreeningAttention,
  recordDisposition: recordSecretaryCallScreeningDisposition,
});
