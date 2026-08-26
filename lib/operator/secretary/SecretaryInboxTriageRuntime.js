import { createHash } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { secretaryJobInstructionRequiresHighAuthority } from "@/lib/operator/secretary/SecretaryJobExecutionRuntime";

const TRIAGE_CATEGORIES = new Set([
  "EXECUTIVE_DECISION",
  "SECRETARY_HANDLE",
  "SECRETARY_HANDLED",
  "WAITING_EXTERNAL",
  "FYI",
  "NEEDS_REVIEW",
]);
const TRIAGE_PRIORITIES = new Set(["URGENT", "HIGH", "NORMAL", "LOW"]);
const RECEPTION_CLOSED_ACTIONS = new Set([
  "ANSWER",
  "CHECK_AVAILABILITY",
  "LIST_APPOINTMENTS",
  "BOOK_APPOINTMENT",
  "RESCHEDULE_APPOINTMENT",
  "CANCEL_APPOINTMENT",
  "CLARIFY",
  "NO_REPLY",
]);
const RECEPTION_OWNED_ACTIONS = new Set(["REQUEST_CALLBACK"]);
const URGENCY_EVIDENCE_PATTERN = /\b(urgent|urgently|asap|immediately|today|tomorrow|deadline|by\s+\d{1,2}(?::\d{2})?|before\s+\d{1,2}(?::\d{2})?)\b/i;

function text(value, limit = 12000) {
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

function uuidFromSeed(seed) {
  const hex = createHash("sha256").update(String(seed)).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
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

function receptionFallbackCategory(action, resultStatus) {
  const normalizedAction = text(action, 80).toUpperCase();
  const normalizedStatus = text(resultStatus, 80).toLowerCase();
  if (normalizedStatus === "action_failed") return "NEEDS_REVIEW";
  if (normalizedAction === "NO_REPLY") return "FYI";
  if (RECEPTION_CLOSED_ACTIONS.has(normalizedAction)) return "SECRETARY_HANDLED";
  if (RECEPTION_OWNED_ACTIONS.has(normalizedAction)) return "SECRETARY_HANDLE";
  if (["LEAVE_MESSAGE", "ATTACHMENT_REVIEW"].includes(normalizedAction)) return "NEEDS_REVIEW";
  return "NEEDS_REVIEW";
}

function normalizeDeadline(value) {
  const raw = text(value, 120);
  if (!raw || !Number.isFinite(Date.parse(raw))) return null;
  return new Date(raw).toISOString();
}

function normalizePriority(value, inboundBody, category, explicitDeadlineAt) {
  let priority = text(value, 40).toUpperCase();
  if (!TRIAGE_PRIORITIES.has(priority)) priority = category === "EXECUTIVE_DECISION" ? "HIGH" : "NORMAL";
  if (category === "EXECUTIVE_DECISION" && ["LOW", "NORMAL"].includes(priority)) priority = "HIGH";
  if (priority === "URGENT") {
    const deadlineSoon = explicitDeadlineAt
      ? Date.parse(explicitDeadlineAt) <= Date.now() + 24 * 60 * 60 * 1000
      : false;
    if (!deadlineSoon && !URGENCY_EVIDENCE_PATTERN.test(inboundBody)) priority = "HIGH";
  }
  return priority;
}

export function normalizeSecretaryInboxTriageDecision({
  rawTriage = {},
  inbound = {},
  result = {},
} = {}) {
  const raw = object(rawTriage);
  const inboundBody = text(inbound.body, 12000);
  const action = text(result.action || raw.reception_action, 80).toUpperCase();
  const fallback = receptionFallbackCategory(action, result.status);
  let category = text(raw.category || raw.triage_category, 80).toUpperCase();
  if (!TRIAGE_CATEGORIES.has(category) || category === "WAITING_EXTERNAL") category = fallback;

  const highAuthority = secretaryJobInstructionRequiresHighAuthority(inboundBody);
  if (highAuthority) category = "EXECUTIVE_DECISION";
  if (text(result.status, 80).toLowerCase() === "action_failed") category = "NEEDS_REVIEW";
  if (action === "ATTACHMENT_REVIEW" && category !== "EXECUTIVE_DECISION") category = "NEEDS_REVIEW";
  if (RECEPTION_OWNED_ACTIONS.has(action) && category === "SECRETARY_HANDLED") category = "SECRETARY_HANDLE";
  if (RECEPTION_CLOSED_ACTIONS.has(action) && ["SECRETARY_HANDLE", "NEEDS_REVIEW"].includes(category) && !highAuthority) {
    category = action === "NO_REPLY" ? "FYI" : "SECRETARY_HANDLED";
  }

  const explicitDeadlineAt = normalizeDeadline(raw.explicit_deadline_at || raw.triage_explicit_deadline_at);
  const priority = normalizePriority(raw.priority || raw.triage_priority, inboundBody, category, explicitDeadlineAt);
  const rationale = text(raw.rationale || raw.triage_reason, 2000) || `Reception action ${action || "UNKNOWN"}`;

  return {
    category,
    priority,
    rationale,
    explicit_deadline_at: explicitDeadlineAt,
    executive_attention_required: ["EXECUTIVE_DECISION", "NEEDS_REVIEW"].includes(category),
    secretary_owns_follow_through: category === "SECRETARY_HANDLE",
    handled_by_reception: ["SECRETARY_HANDLED", "FYI"].includes(category),
    high_authority_boundary_detected: highAuthority,
    source_inbound_message_id: text(inbound.id, 120) || null,
    reception_action: action || null,
    attendance_not_inferred: true,
    external_authority_used: false,
  };
}

async function ensureContactProfile({ organization, partyId, conversation }) {
  const id = text(partyId, 120);
  if (!id) return null;
  const existing = await one(
    supabaseAdmin
      .from("secretary_contact_profiles")
      .select("*")
      .eq("organization_id", organization)
      .eq("party_id", id)
      .maybeSingle(),
  );
  if (existing) return existing;

  const preferredChannel = text(conversation.channel_type || conversation.provider, 120).toLowerCase() || null;
  const inserted = await supabaseAdmin
    .from("secretary_contact_profiles")
    .insert({
      organization_id: organization,
      party_id: id,
      preferred_channel: preferredChannel,
      metadata: {
        created_by_secretary_inbox_triage: true,
        identity_source: "SECRETARY_MESSAGE_RECEPTION",
        external_authority_used: false,
      },
    })
    .select("*")
    .single();
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      return one(
        supabaseAdmin
          .from("secretary_contact_profiles")
          .select("*")
          .eq("organization_id", organization)
          .eq("party_id", id)
          .maybeSingle(),
      );
    }
    throw inserted.error;
  }
  return inserted.data;
}

async function secretaryOwnerPartyId(organization) {
  const settings = await one(
    supabaseAdmin
      .from("secretary_settings")
      .select("booking_policy,metadata")
      .eq("organization_id", organization)
      .maybeSingle(),
  );
  const booking = object(settings?.booking_policy);
  const metadata = object(settings?.metadata);
  return text(booking.owner_party_id || metadata.owner_party_id, 120) || null;
}

async function existingTriageJob(organization, requestId) {
  const deterministicId = uuidFromSeed(`avantiqo-secretary-inbox-triage-job-v1:${organization}:${requestId}`);
  const row = await one(
    supabaseAdmin
      .from("secretary_jobs")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", deterministicId)
      .maybeSingle(),
  );
  return { deterministicId, row };
}

async function ensureSecretaryTriageJob({ request, conversation, inbound, triage }) {
  if (triage.category !== "SECRETARY_HANDLE") return null;
  if (!request.contact_party_id || !text(inbound.body, 12000)) return null;
  if (RECEPTION_OWNED_ACTIONS.has(text(triage.reception_action, 80).toUpperCase())) return null;
  if (triage.high_authority_boundary_detected) return null;

  await ensureContactProfile({
    organization: request.organization_id,
    partyId: request.contact_party_id,
    conversation,
  });

  const prior = await existingTriageJob(request.organization_id, request.id);
  if (prior.row) return prior.row;
  const ownerPartyId = await secretaryOwnerPartyId(request.organization_id);
  const sender = text(conversation.external_participant_name || conversation.external_participant_address, 500) || "external contact";
  const body = text(inbound.body, 7000);
  const objective = [
    `Handle the routine inbound correspondence from ${sender} and close the loop as Executive Secretary.`,
    `Use the exact source message as evidence: ${body}`,
    "Do not invent facts, prices, approvals, promises, deadlines, bookings, payments, signatures, legal acceptance, or commercial commitments.",
    "If any step requires high authority or a business decision, stop at the governed review/approval boundary instead of acting.",
  ].join(" ");

  const insert = await supabaseAdmin
    .from("secretary_jobs")
    .insert({
      id: prior.deterministicId,
      organization_id: request.organization_id,
      requested_by_party_id: ownerPartyId,
      source_kind: "MESSAGE",
      source_id: request.id,
      objective,
      success_criteria: [
        "Resolve or correctly route the exact inbound request using evidence-backed Secretary actions.",
        "Own necessary follow-up until the request is closed or executive input is genuinely required.",
        "Never cross purchase, payment, contract, signature, legal acceptance, travel booking, or other high-authority boundaries without exact-step approval.",
      ],
      status: "QUEUED",
      autonomy_level: "EXECUTE_WITH_GATES",
      approval_policy: {},
      execution_plan: [],
      next_action_at: new Date().toISOString(),
      max_attempts: 20,
      metadata: {
        inbox_triage_job: true,
        inbox_triage_category: triage.category,
        inbox_triage_priority: triage.priority,
        source_reception_request_id: request.id,
        source_conversation_id: conversation.id,
        source_inbound_message_id: inbound.id,
        source_contact_party_id: request.contact_party_id,
        secretary_role: "EXECUTIVE_SECRETARY",
        external_authority_used: false,
      },
    })
    .select("*")
    .single();
  if (insert.error) {
    if (insert.error.code === "23505") {
      return (await existingTriageJob(request.organization_id, request.id)).row;
    }
    throw insert.error;
  }

  const tasks = await many(
    supabaseAdmin
      .from("secretary_tasks")
      .select("id,metadata")
      .eq("organization_id", request.organization_id)
      .eq("source", "secretary_message")
      .contains("metadata", { secretary_reception_request_id: request.id })
      .limit(20),
  );
  for (const task of tasks) {
    const update = await supabaseAdmin
      .from("secretary_tasks")
      .update({
        metadata: {
          ...object(task.metadata),
          execution_owner: "SECRETARY",
          secretary_owned: true,
          inbox_triage_job_id: insert.data.id,
          external_authority_used: false,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", request.organization_id)
      .eq("id", task.id);
    if (update.error) throw update.error;
  }

  return insert.data;
}

async function cancelStaleWaitingExternalFollowUps(organization, conversationId, sourceInboundMessageId) {
  const pending = await many(
    supabaseAdmin
      .from("secretary_follow_ups")
      .select("id,metadata")
      .eq("organization_id", organization)
      .eq("conversation_id", conversationId)
      .eq("status", "PENDING")
      .contains("metadata", { inbox_waiting_external: true })
      .limit(50),
  );
  if (!pending.length) return 0;
  const now = new Date().toISOString();
  for (const row of pending) {
    const result = await supabaseAdmin
      .from("secretary_follow_ups")
      .update({
        status: "CANCELLED",
        result: "External response received before chase execution",
        completed_at: now,
        updated_at: now,
        metadata: {
          ...object(row.metadata),
          cancelled_by_inbound_response: true,
          response_inbound_message_id: sourceInboundMessageId,
          external_authority_used: false,
        },
      })
      .eq("organization_id", organization)
      .eq("id", row.id)
      .eq("status", "PENDING");
    if (result.error) throw result.error;
  }
  return pending.length;
}

export async function recordSecretaryInboundTriage({ request = {}, result = {} } = {}) {
  const requestId = text(request.id, 120);
  const organization = text(request.organization_id, 120);
  if (!requestId || !organization) throw new Error("SECRETARY_INBOX_TRIAGE_RECEPTION_REQUEST_REQUIRED");

  const currentRequest = await one(
    supabaseAdmin
      .from("secretary_message_reception_requests")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", requestId)
      .maybeSingle(),
  ) || request;
  const [conversation, inbound] = await Promise.all([
    one(
      supabaseAdmin
        .from("communication_conversations")
        .select("*")
        .eq("organization_id", organization)
        .eq("id", currentRequest.conversation_id)
        .maybeSingle(),
    ),
    one(
      supabaseAdmin
        .from("communication_messages")
        .select("*")
        .eq("organization_id", organization)
        .eq("id", currentRequest.inbound_message_id)
        .maybeSingle(),
    ),
  ]);
  if (!conversation || !inbound || inbound.direction !== "INBOUND") {
    throw new Error("SECRETARY_INBOX_TRIAGE_EVIDENCE_REQUIRED");
  }

  const triage = normalizeSecretaryInboxTriageDecision({
    rawTriage: result.inbox_triage || result.triage || {},
    inbound,
    result,
  });
  await cancelStaleWaitingExternalFollowUps(organization, conversation.id, inbound.id);
  const job = await ensureSecretaryTriageJob({ request: currentRequest, conversation, inbound, triage });
  const now = new Date().toISOString();
  const triageEvidence = {
    ...triage,
    source_reception_request_id: requestId,
    source_conversation_id: conversation.id,
    source_inbound_message_id: inbound.id,
    secretary_job_id: job?.id || null,
    triaged_at: now,
  };

  const conversationUpdate = await supabaseAdmin
    .from("communication_conversations")
    .update({
      metadata: {
        ...object(conversation.metadata),
        secretary_inbox_triage: triageEvidence,
      },
      updated_at: now,
    })
    .eq("organization_id", organization)
    .eq("id", conversation.id);
  if (conversationUpdate.error) throw conversationUpdate.error;

  const requestUpdate = await supabaseAdmin
    .from("secretary_message_reception_requests")
    .update({
      metadata: {
        ...object(currentRequest.metadata),
        secretary_inbox_triage: triageEvidence,
      },
      updated_at: now,
    })
    .eq("organization_id", organization)
    .eq("id", requestId);
  if (requestUpdate.error) throw requestUpdate.error;

  return {
    status: "completed",
    contract: "AVANTIQO_EXECUTIVE_SECRETARY_INBOX_TRIAGE_V1",
    conversation_id: conversation.id,
    inbound_message_id: inbound.id,
    triage: triageEvidence,
    secretary_job: job,
    executive_attention_required: triage.executive_attention_required,
    secretary_owns_follow_through: triage.secretary_owns_follow_through,
    external_authority_used: false,
  };
}

function outboundTimestamp(message) {
  const value = message.sent_at || message.created_at || message.updated_at;
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) ? ms : null;
}

function conversationActionType(conversation) {
  const provider = text(conversation.provider, 120).toLowerCase();
  const channel = text(conversation.channel_type, 120).toLowerCase();
  return provider.includes("email") || channel.includes("email") ? "EMAIL" : "MESSAGE";
}

async function ensureWaitingExternalFollowUp({ organization, conversation, outbound, waitHours, now }) {
  if (!conversation.customer_party_id) return null;
  const outboundBody = text(outbound.body, 8000);
  if (!outboundBody || secretaryJobInstructionRequiresHighAuthority(outboundBody)) return null;
  await ensureContactProfile({ organization, partyId: conversation.customer_party_id, conversation });

  const followUpId = uuidFromSeed(
    `avantiqo-secretary-inbox-waiting-external-v1:${organization}:${conversation.id}:${outbound.id}`,
  );
  const existing = await one(
    supabaseAdmin
      .from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", followUpId)
      .maybeSingle(),
  );
  if (existing) return existing;

  const sentMs = outboundTimestamp(outbound) || now.getTime();
  const dueAt = new Date(Math.max(now.getTime(), sentMs + waitHours * 60 * 60 * 1000)).toISOString();
  const actionType = conversationActionType(conversation);
  const instruction = "Follow up on the most recent outbound request only and ask whether there is an update. Do not add or change terms, prices, promises, deadlines, approvals, bookings, payments, signatures, legal acceptance, or other commitments.";
  const insert = await supabaseAdmin
    .from("secretary_follow_ups")
    .insert({
      id: followUpId,
      organization_id: organization,
      contact_party_id: conversation.customer_party_id,
      conversation_id: conversation.id,
      action_type: actionType,
      reason: "Secretary is waiting for an external response to an existing outbound request",
      status: "PENDING",
      due_at: dueAt,
      metadata: {
        execution_owner: "SECRETARY",
        execution_ready: true,
        execution_instruction: instruction,
        secretary_owned: true,
        inbox_waiting_external: true,
        source_outbound_message_id: outbound.id,
        source_conversation_id: conversation.id,
        external_authority_used: false,
      },
    })
    .select("*")
    .single();
  if (insert.error) {
    if (insert.error.code === "23505") {
      return one(
        supabaseAdmin
          .from("secretary_follow_ups")
          .select("*")
          .eq("organization_id", organization)
          .eq("id", followUpId)
          .maybeSingle(),
      );
    }
    throw insert.error;
  }
  return insert.data;
}

export async function reconcileSecretaryWaitingExternal({
  organizationId: organizationValue = null,
  now = new Date(),
  waitHours = 24,
  limit = 50,
} = {}) {
  const organization = text(organizationValue, 120) || null;
  const effectiveNow = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(effectiveNow.getTime())) throw new Error("SECRETARY_INBOX_TRIAGE_NOW_INVALID");
  const boundedWaitHours = Math.max(1, Math.min(Number(waitHours) || 24, 24 * 14));
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const cutoff = new Date(effectiveNow.getTime() - boundedWaitHours * 60 * 60 * 1000).toISOString();

  let query = supabaseAdmin
    .from("communication_conversations")
    .select("*")
    .eq("status", "OPEN")
    .not("last_outbound_at", "is", null)
    .lte("last_outbound_at", cutoff)
    .order("last_outbound_at", { ascending: true })
    .limit(boundedLimit);
  if (organization) query = query.eq("organization_id", organization);
  const conversations = await many(query);
  const results = [];

  for (const conversation of conversations) {
    const outboundMs = Date.parse(conversation.last_outbound_at || "");
    const inboundMs = Date.parse(conversation.last_inbound_at || "");
    if (Number.isFinite(inboundMs) && Number.isFinite(outboundMs) && inboundMs >= outboundMs) continue;

    const outbound = await one(
      supabaseAdmin
        .from("communication_messages")
        .select("*")
        .eq("organization_id", conversation.organization_id)
        .eq("conversation_id", conversation.id)
        .eq("direction", "OUTBOUND")
        .in("status", ["SENT", "DELIVERED", "READ"])
        .order("sent_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    if (!outbound) continue;
    const highAuthority = secretaryJobInstructionRequiresHighAuthority(text(outbound.body, 8000));
    const followUp = highAuthority
      ? null
      : await ensureWaitingExternalFollowUp({
          organization: conversation.organization_id,
          conversation,
          outbound,
          waitHours: boundedWaitHours,
          now: effectiveNow,
        });
    const triage = {
      category: highAuthority ? "EXECUTIVE_DECISION" : "WAITING_EXTERNAL",
      priority: highAuthority ? "HIGH" : "NORMAL",
      rationale: highAuthority
        ? "Latest outbound thread contains a high-authority commitment boundary and cannot be autonomously chased."
        : "Awaiting an external response to an existing outbound request.",
      executive_attention_required: highAuthority,
      secretary_owns_follow_through: !highAuthority,
      handled_by_reception: false,
      high_authority_boundary_detected: highAuthority,
      source_outbound_message_id: outbound.id,
      waiting_external_since: conversation.last_outbound_at,
      waiting_external_follow_up_id: followUp?.id || null,
      triaged_at: effectiveNow.toISOString(),
      attendance_not_inferred: true,
      external_authority_used: false,
    };
    const update = await supabaseAdmin
      .from("communication_conversations")
      .update({
        metadata: {
          ...object(conversation.metadata),
          secretary_inbox_triage: triage,
        },
        updated_at: effectiveNow.toISOString(),
      })
      .eq("organization_id", conversation.organization_id)
      .eq("id", conversation.id);
    if (update.error) throw update.error;
    results.push({ conversation_id: conversation.id, triage, follow_up_id: followUp?.id || null });
  }

  return {
    status: "completed",
    contract: "AVANTIQO_EXECUTIVE_SECRETARY_INBOX_TRIAGE_V1",
    processed_count: results.length,
    results,
    waiting_external_follow_ups_are_secretary_owned: true,
    high_authority_auto_chase_blocked: true,
    external_authority_used: false,
  };
}

export async function readSecretaryInboxTriage({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const limit = Math.max(1, Math.min(Number(payload.limit) || 100, 200));
  const rows = await many(
    supabaseAdmin
      .from("communication_conversations")
      .select("id,provider,channel_type,external_participant_name,external_participant_address,customer_party_id,subject,status,unread_count,last_message_at,last_inbound_at,last_outbound_at,metadata,updated_at")
      .eq("organization_id", organization)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(limit),
  );
  const items = rows
    .map((row) => ({ ...row, triage: object(object(row.metadata).secretary_inbox_triage) }))
    .filter((row) => text(row.triage.category, 80));
  const bucket = (category) => items.filter((row) => row.triage.category === category);
  const executiveDecision = bucket("EXECUTIVE_DECISION");
  const needsReview = bucket("NEEDS_REVIEW");
  const secretaryHandle = bucket("SECRETARY_HANDLE");
  const waitingExternal = bucket("WAITING_EXTERNAL");
  const handled = bucket("SECRETARY_HANDLED");
  const fyi = bucket("FYI");

  return {
    status: "completed",
    contract: "AVANTIQO_EXECUTIVE_SECRETARY_INBOX_TRIAGE_V1",
    items,
    executive_attention: [...executiveDecision, ...needsReview],
    executive_decisions: executiveDecision,
    needs_review: needsReview,
    secretary_handling: secretaryHandle,
    waiting_external: waitingExternal,
    secretary_handled: handled,
    fyi,
    executive_attention_count: executiveDecision.length + needsReview.length,
    secretary_owned_count: secretaryHandle.length + waitingExternal.length,
    external_authority_used: false,
  };
}

export default Object.freeze({
  normalize: normalizeSecretaryInboxTriageDecision,
  recordInbound: recordSecretaryInboundTriage,
  reconcileWaitingExternal: reconcileSecretaryWaitingExternal,
  read: readSecretaryInboxTriage,
});
