import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryCanonicalOwner,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_MEETING_CLOSEOUT_V1";
const SOURCE = "secretary_meeting_closeout";
const EXACT_MESSAGE_SOURCE = "MEETING_CLOSEOUT_V1";

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

function deterministicUuid(seed) {
  const chars = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function closeoutTaskId(organization, meetingId) {
  return deterministicUuid(`avantiqo-secretary-meeting-closeout-v1:${organization}:${meetingId}`);
}

function closeoutFollowUpId(taskId, partyId, kind, version = 1) {
  return deterministicUuid(`avantiqo-secretary-meeting-closeout-follow-up-v1:${taskId}:${partyId || "owner"}:${kind}:${version}`);
}

function iso(value, field, { required = false } = {}) {
  const raw = text(value, 180);
  if (!raw) {
    if (required) throw new Error(`SECRETARY_MEETING_CLOSEOUT_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_MEETING_CLOSEOUT_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
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

async function requireCompletedMeeting(organization, meetingId) {
  const id = text(meetingId, 120);
  if (!id) throw new Error("SECRETARY_MEETING_CLOSEOUT_MEETING_REQUIRED");
  const meeting = await one(
    supabaseAdmin.from("secretary_meetings")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!meeting) throw new Error("SECRETARY_MEETING_CLOSEOUT_MEETING_NOT_FOUND");
  if (meeting.status !== "COMPLETED") throw new Error("SECRETARY_MEETING_CLOSEOUT_MEETING_NOT_COMPLETED");
  if (!text(meeting.protocol, 50000) && !text(meeting.executive_summary, 12000)) {
    throw new Error("SECRETARY_MEETING_CLOSEOUT_MINUTES_UNAVAILABLE");
  }
  return meeting;
}

async function loadCloseoutTask(organization, meetingId) {
  return one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", closeoutTaskId(organization, meetingId))
      .maybeSingle(),
  );
}

function normalizeExplicitRecipients(value) {
  const rows = list(value).slice(0, 100).map((item) => {
    const row = typeof item === "string" ? { party_id: item } : object(item);
    const partyId = text(row.party_id || row.partyId, 120);
    if (!partyId) throw new Error("SECRETARY_MEETING_CLOSEOUT_RECIPIENT_PARTY_REQUIRED");
    const action = text(row.action_type || row.actionType, 40).toUpperCase();
    return {
      party_id: partyId,
      explicit_action_type: ["MESSAGE", "EMAIL"].includes(action) ? action : null,
      roster_source: "EXPLICIT",
    };
  });
  const seen = new Set();
  return rows.filter((row) => {
    if (seen.has(row.party_id)) return false;
    seen.add(row.party_id);
    return true;
  });
}

async function recordedMeetingRecipients(organization, meetingId, canonicalOwnerPartyId) {
  const participants = await many(
    supabaseAdmin.from("secretary_meeting_participants")
      .select("party_id,display_name,participant_role,metadata")
      .eq("organization_id", organization)
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: true }),
  );
  const seen = new Set();
  return participants
    .filter((row) => row.party_id && row.party_id !== canonicalOwnerPartyId)
    .filter((row) => {
      if (seen.has(row.party_id)) return false;
      seen.add(row.party_id);
      return true;
    })
    .map((row) => ({
      party_id: row.party_id,
      explicit_action_type: null,
      roster_source: "MEETING_PARTICIPANT_RECORD",
      participant_role: row.participant_role || null,
      attendance_inferred: false,
    }));
}

async function recipientProfiles(organization, partyIds) {
  const ids = [...new Set(partyIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await many(
    supabaseAdmin.from("secretary_contact_profiles")
      .select("party_id,preferred_channel,allow_messages")
      .eq("organization_id", organization)
      .in("party_id", ids),
  );
  return new Map(rows.map((row) => [row.party_id, row]));
}

async function validateRecipientParties(organization, recipients) {
  const ids = [...new Set(recipients.map((row) => row.party_id).filter(Boolean))];
  if (!ids.length) throw new Error("SECRETARY_MEETING_CLOSEOUT_RECIPIENTS_REQUIRED");
  const rows = await many(
    supabaseAdmin.from("parties")
      .select("id,display_name,legal_name,email,phone,status")
      .eq("organization_id", organization)
      .in("id", ids),
  );
  if (rows.length !== ids.length) throw new Error("SECRETARY_MEETING_CLOSEOUT_RECIPIENT_NOT_FOUND");
  const byId = new Map(rows.map((row) => [row.id, row]));
  return byId;
}

async function resolveRecipients(organization, meeting, canonicalOwnerPartyId, payload = {}) {
  let recipients = normalizeExplicitRecipients(payload.recipients || payload.recipient_party_ids || payload.recipientPartyIds);
  if (!recipients.length) {
    recipients = await recordedMeetingRecipients(organization, meeting.id, canonicalOwnerPartyId);
  }
  const parties = await validateRecipientParties(organization, recipients);
  const profiles = await recipientProfiles(organization, recipients.map((row) => row.party_id));
  return recipients.map((row) => {
    const profile = profiles.get(row.party_id);
    const preferred = text(profile?.preferred_channel, 120).toLowerCase();
    const actionType = row.explicit_action_type || (preferred.includes("email") ? "EMAIL" : profile?.allow_messages === false ? "REVIEW" : "MESSAGE");
    const party = parties.get(row.party_id);
    return {
      party_id: row.party_id,
      display_name: text(party?.display_name || party?.legal_name, 300) || null,
      action_type: actionType,
      roster_source: row.roster_source,
      distribution_status: "NOT_QUEUED",
      acknowledgement_status: "PENDING",
      acknowledged_at: null,
      acknowledgement_evidence_id: null,
      correction_requests: [],
      attendance_inferred: false,
      delivery_inferred: false,
      approval_inferred: false,
    };
  });
}

function renderEvidenceValue(value, limit = 1200) {
  if (typeof value === "string") return text(value, limit);
  try {
    return text(JSON.stringify(value), limit);
  } catch {
    return text(value, limit);
  }
}

async function meetingActionItems(organization, meetingId) {
  return many(
    supabaseAdmin.from("secretary_meeting_action_items")
      .select("id,owner_kind,owner_party_id,title,details,priority,due_at,status,execution_ready,task_id,job_id,metadata")
      .eq("organization_id", organization)
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: true })
      .limit(100),
  );
}

function closeoutMessage(meeting, actionItems, { acknowledgementRequired, acknowledgementDueAt } = {}) {
  const decisions = list(meeting.decisions).slice(0, 50).map((item) => `- ${renderEvidenceValue(item, 1200)}`);
  const unresolved = list(meeting.unresolved_questions).slice(0, 30).map((item) => `- ${renderEvidenceValue(item, 1000)}`);
  const actions = list(actionItems).slice(0, 60).map((item) => {
    const due = item.due_at ? `; due ${item.due_at}` : "";
    const owner = item.owner_kind ? `; owner ${item.owner_kind}` : "";
    return `- ${text(item.title, 500)}${owner}${due}`;
  });
  const body = [
    `Meeting closeout: ${text(meeting.title, 800)}`,
    meeting.started_at ? `Meeting started: ${meeting.started_at}` : null,
    meeting.ended_at ? `Meeting ended: ${meeting.ended_at}` : null,
    meeting.executive_summary ? `Executive summary:\n${text(meeting.executive_summary, 6000)}` : null,
    meeting.protocol ? `Meeting protocol / minutes:\n${text(meeting.protocol, 20000)}` : null,
    decisions.length ? `Recorded decisions:\n${decisions.join("\n")}` : null,
    actions.length ? `Recorded action items:\n${actions.join("\n")}` : null,
    unresolved.length ? `Unresolved questions:\n${unresolved.join("\n")}` : null,
    acknowledgementRequired
      ? `Please acknowledge receipt${acknowledgementDueAt ? ` by ${acknowledgementDueAt}` : ""}, or send any factual correction to these minutes.`
      : "Please send any factual correction to these minutes if needed.",
    "This closeout distributes Avantiqo's recorded meeting evidence. It does not confirm attendance, RSVP, approval, acceptance, legal effect, or agreement by any recipient.",
  ].filter(Boolean).join("\n\n");
  return text(body, 32000);
}

function acknowledgementChaseMessage(meeting, acknowledgementDueAt) {
  return text([
    `Follow-up on meeting closeout: ${text(meeting.title, 800)}`,
    "Please acknowledge receipt of the previously distributed meeting minutes, or send any factual correction that should be reviewed.",
    acknowledgementDueAt ? `Recorded acknowledgement deadline: ${acknowledgementDueAt}.` : null,
    "Receipt acknowledgement is administrative evidence only. It is not approval, acceptance, RSVP, attendance confirmation, or agreement with the minutes.",
  ].filter(Boolean).join("\n\n"), 5000);
}

function correctionReviewInstruction(meeting, recipient, correctionText, evidenceId) {
  return text([
    `Review an explicit correction request for meeting closeout \"${text(meeting.title, 600)}\".`,
    recipient.display_name ? `Recipient: ${recipient.display_name}.` : `Recipient party_id: ${recipient.party_id}.`,
    `Correction evidence: ${evidenceId}.`,
    `Correction supplied: ${text(correctionText, 2500)}.`,
    "Do not alter the recorded meeting minutes automatically. Review the evidence and decide whether a governed minutes revision is required.",
  ].join(" "), 4000);
}

async function ensureFollowUp({ task, meeting, recipient, kind, version = 1, dueAt, body, executionReady = true, contactPartyId = null }) {
  const partyId = contactPartyId || recipient?.party_id || task.owner_party_id || null;
  const id = closeoutFollowUpId(task.id, partyId, kind, version);
  const existing = await one(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", task.organization_id)
      .eq("id", id)
      .maybeSingle(),
  );
  if (existing) return existing;
  const actionType = recipient?.action_type || "REVIEW";
  const exactMessage = ["MESSAGE", "EMAIL"].includes(actionType) && executionReady;
  const inserted = await supabaseAdmin.from("secretary_follow_ups").insert({
    id,
    organization_id: task.organization_id,
    entity_id: task.entity_id || null,
    owner_party_id: task.owner_party_id || null,
    contact_party_id: partyId,
    task_id: task.id,
    calendar_event_id: meeting.calendar_event_id || null,
    action_type: actionType,
    reason: text(body, 4000),
    status: "PENDING",
    due_at: iso(dueAt, "follow_up_due_at", { required: true }),
    created_by_party_id: task.created_by_party_id || task.owner_party_id || null,
    metadata: {
      execution_owner: executionReady ? "SECRETARY" : "EXECUTIVE",
      execution_ready: executionReady && ["MESSAGE", "EMAIL"].includes(actionType),
      execution_instruction: text(body, 4000),
      secretary_owned: true,
      secretary_meeting_closeout: true,
      secretary_meeting_closeout_contract: CONTRACT,
      secretary_meeting_closeout_task_id: task.id,
      secretary_meeting_closeout_meeting_id: meeting.id,
      secretary_meeting_closeout_kind: kind,
      secretary_meeting_closeout_version: version,
      secretary_coverage_scope: "FOLLOW_UP_COORDINATION",
      canonical_owner_party_id: object(task.metadata).canonical_owner_party_id || task.owner_party_id || null,
      operational_assignee_party_id: object(task.metadata).operational_assignee_party_id || task.owner_party_id || null,
      secretary_exact_message_body_source: exactMessage ? EXACT_MESSAGE_SOURCE : null,
      secretary_exact_message_body: exactMessage ? text(body, 32000) : null,
      participant_record_recipient: recipient?.roster_source === "MEETING_PARTICIPANT_RECORD",
      attendance_inferred: false,
      delivery_inferred: false,
      acknowledgement_not_approval: true,
      acceptance_inferred: false,
      agreement_inferred: false,
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

async function cancelPendingCloseoutFollowUps({ task, partyId = null, kinds = null, reason }) {
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
    if (metadata.secretary_meeting_closeout !== true) return false;
    if (partyId && row.contact_party_id !== partyId) return false;
    if (allowedKinds && !allowedKinds.has(text(metadata.secretary_meeting_closeout_kind, 100))) return false;
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

async function mutateCloseoutTask(organization, meetingId, producer) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const task = await loadCloseoutTask(organization, meetingId);
    if (!task) throw new Error("SECRETARY_MEETING_CLOSEOUT_NOT_FOUND");
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
  throw new Error("SECRETARY_MEETING_CLOSEOUT_CONCURRENT_UPDATE_RETRY_REQUIRED");
}

async function closeoutCoverage(organization, actor, at = new Date().toISOString()) {
  const canonicalOwner = await resolveSecretaryCanonicalOwner({ organizationId: organization }) || actor;
  const routing = await resolveSecretaryAdministrativeCoverage({
    organizationId: organization,
    ownerPartyId: canonicalOwner,
    scope: "MEETING_COORDINATION",
    instruction: "Coordinate post-meeting minutes distribution, receipt acknowledgement, correction collection and administrative follow-through.",
    at,
    requiresOwnerAuthority: false,
  });
  if (routing.coverage_routing_review_required === true) {
    throw new Error(`SECRETARY_MEETING_CLOSEOUT_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  }
  return { canonicalOwner, routing };
}

function acknowledgementWindow(payload = {}, now = new Date()) {
  const required = payload.acknowledgement_required === true || payload.acknowledgementRequired === true;
  if (!required) return { required: false, due_at: null, defaulted: false };
  const supplied = iso(payload.acknowledgement_due_at || payload.acknowledgementDueAt, "acknowledgement_due_at");
  if (supplied) {
    if (Date.parse(supplied) <= now.getTime()) throw new Error("SECRETARY_MEETING_CLOSEOUT_ACKNOWLEDGEMENT_DUE_AT_PAST");
    return { required: true, due_at: supplied, defaulted: false };
  }
  return { required: true, due_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), defaulted: true };
}

export async function startSecretaryMeetingCloseout({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const meeting = await requireCompletedMeeting(organization, payload.meeting_id || payload.meetingId);
  const existing = await loadCloseoutTask(organization, meeting.id);
  if (existing) return readSecretaryMeetingCloseout({ context, payload: { meeting_id: meeting.id } });

  const coverage = await closeoutCoverage(organization, actor);
  const recipients = await resolveRecipients(organization, meeting, coverage.canonicalOwner, payload);
  const ack = acknowledgementWindow(payload);
  const actionItems = await meetingActionItems(organization, meeting.id);
  const exactBody = closeoutMessage(meeting, actionItems, {
    acknowledgementRequired: ack.required,
    acknowledgementDueAt: ack.due_at,
  });
  const id = closeoutTaskId(organization, meeting.id);
  const coverageMetadata = secretaryAdministrativeCoverageMetadata(coverage.routing);
  const metadata = {
    secretary_role: "EXECUTIVE_SECRETARY",
    secretary_owned: true,
    secretary_meeting_closeout: true,
    secretary_meeting_closeout_contract: CONTRACT,
    meeting_id: meeting.id,
    closeout_version: 1,
    closeout_state: "DISTRIBUTION_PENDING",
    recipients,
    acknowledgement_required: ack.required,
    acknowledgement_due_at: ack.due_at,
    acknowledgement_deadline_defaulted: ack.defaulted,
    distribution_follow_up_ids: [],
    acknowledgement_chase_follow_up_ids: [],
    correction_review_follow_up_ids: [],
    canonical_owner_party_id: coverage.canonicalOwner,
    operational_assignee_party_id: coverage.routing.operational_assignee_party_id || coverage.canonicalOwner,
    ...coverageMetadata,
    attendance_inferred: false,
    distribution_delivery_inferred: false,
    acknowledgement_not_approval: true,
    correction_changes_minutes_automatically: false,
    approval_authority_delegated: false,
    binding_authority_delegated: false,
    platform_permissions_mutated: false,
    external_authority_used: false,
  };

  const inserted = await supabaseAdmin.from("secretary_tasks").insert({
    id,
    organization_id: organization,
    entity_id: meeting.entity_id || context.entityId || null,
    owner_party_id: coverage.canonicalOwner,
    calendar_event_id: meeting.calendar_event_id || null,
    title: `Close out meeting: ${text(meeting.title, 420)}`,
    details: `Distribute the recorded meeting protocol and action items, collect factual corrections, and ${ack.required ? "track receipt acknowledgement" : "close distribution"} without inferring attendance or approval.`,
    status: "IN_PROGRESS",
    priority: "NORMAL",
    due_at: ack.due_at || new Date().toISOString(),
    source: SOURCE,
    created_by_party_id: coverage.routing.operational_assignee_party_id || actor,
    metadata,
  }).select("*").single();
  if (inserted.error) {
    if (inserted.error.code === "23505") return readSecretaryMeetingCloseout({ context, payload: { meeting_id: meeting.id } });
    throw inserted.error;
  }
  let task = inserted.data;

  const distributionIds = [];
  for (const recipient of recipients) {
    const followUp = await ensureFollowUp({
      task,
      meeting,
      recipient,
      kind: "MINUTES_DISTRIBUTION",
      version: 1,
      dueAt: new Date().toISOString(),
      body: exactBody,
      executionReady: ["MESSAGE", "EMAIL"].includes(recipient.action_type),
    });
    distributionIds.push(followUp.id);
  }

  const mutation = await mutateCloseoutTask(organization, meeting.id, async (currentTask, currentMetadata) => ({
    metadata: {
      ...currentMetadata,
      closeout_state: "DISTRIBUTION_QUEUED",
      distribution_queued_at: new Date().toISOString(),
      distribution_follow_up_ids: distributionIds,
      recipients: list(currentMetadata.recipients).map((recipient) => ({
        ...recipient,
        distribution_status: ["MESSAGE", "EMAIL"].includes(recipient.action_type) ? "QUEUED" : "CHANNEL_REVIEW_REQUIRED",
      })),
    },
    task_patch: { status: "IN_PROGRESS" },
    output: { distribution_follow_up_ids: distributionIds },
  }));
  task = mutation.task;

  return {
    status: "started",
    contract: CONTRACT,
    task,
    meeting_id: meeting.id,
    recipients: list(task.metadata?.recipients),
    distribution_follow_up_ids: distributionIds,
    exact_minutes_distribution: true,
    deterministic_task_id: true,
    deterministic_follow_up_ids: true,
    replay_safe: true,
    attendance_inferred: false,
    acknowledgement_not_approval: true,
    correction_changes_minutes_automatically: false,
    external_authority_used: false,
  };
}

export async function readSecretaryMeetingCloseout({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const meeting = await requireCompletedMeeting(organization, payload.meeting_id || payload.meetingId);
  const task = await loadCloseoutTask(organization, meeting.id);
  if (!task) throw new Error("SECRETARY_MEETING_CLOSEOUT_NOT_FOUND");
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
    meeting,
    task,
    recipients: list(object(task.metadata).recipients),
    follow_ups: followUps,
    attendance_inferred: false,
    distribution_delivery_inferred: false,
    acknowledgement_not_approval: true,
    correction_changes_minutes_automatically: false,
    external_authority_used: false,
  };
}

export async function recordSecretaryMeetingCloseoutResponse({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const meeting = await requireCompletedMeeting(organization, payload.meeting_id || payload.meetingId);
  const partyId = text(payload.recipient_party_id || payload.recipientPartyId, 120);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 300);
  const responseKind = text(payload.response_kind || payload.responseKind, 80).toUpperCase();
  if (!partyId) throw new Error("SECRETARY_MEETING_CLOSEOUT_RECIPIENT_PARTY_REQUIRED");
  if (!evidenceId) throw new Error("SECRETARY_MEETING_CLOSEOUT_RESPONSE_EVIDENCE_REQUIRED");
  if (!["ACKNOWLEDGED", "CORRECTION_REQUESTED"].includes(responseKind)) throw new Error("SECRETARY_MEETING_CLOSEOUT_RESPONSE_KIND_INVALID");
  const correctionText = text(payload.correction_text || payload.correctionText, 5000);
  if (responseKind === "CORRECTION_REQUESTED" && !correctionText) throw new Error("SECRETARY_MEETING_CLOSEOUT_CORRECTION_TEXT_REQUIRED");

  const mutation = await mutateCloseoutTask(organization, meeting.id, async (task, metadata) => {
    const recipients = list(metadata.recipients);
    const index = recipients.findIndex((row) => row.party_id === partyId);
    if (index < 0) throw new Error("SECRETARY_MEETING_CLOSEOUT_RECIPIENT_NOT_IN_ROSTER");
    const now = new Date().toISOString();
    const nextRecipients = recipients.map((recipient, position) => {
      if (position !== index) return recipient;
      if (responseKind === "ACKNOWLEDGED") {
        return {
          ...recipient,
          acknowledgement_status: "ACKNOWLEDGED",
          acknowledged_at: now,
          acknowledgement_evidence_id: evidenceId,
          acknowledgement_not_approval: true,
          attendance_inferred: false,
          approval_inferred: false,
        };
      }
      return {
        ...recipient,
        acknowledgement_status: "CORRECTION_REQUESTED",
        correction_requests: [
          ...list(recipient.correction_requests),
          { evidence_id: evidenceId, correction_text: correctionText, recorded_at: now },
        ].slice(-20),
        acknowledgement_not_approval: true,
        attendance_inferred: false,
        approval_inferred: false,
      };
    });
    return {
      metadata: {
        ...metadata,
        recipients: nextRecipients,
        closeout_state: responseKind === "CORRECTION_REQUESTED" ? "CORRECTION_REVIEW" : metadata.closeout_state,
        last_response_at: now,
      },
      task_patch: { status: "IN_PROGRESS" },
      output: { recipient: nextRecipients[index], response_kind: responseKind },
    };
  });

  await cancelPendingCloseoutFollowUps({
    task: mutation.task,
    partyId,
    kinds: ["ACKNOWLEDGEMENT_CHASE"],
    reason: "Meeting closeout response recorded with explicit evidence",
  });

  let correctionReviewFollowUpId = null;
  if (responseKind === "CORRECTION_REQUESTED") {
    const recipient = mutation.output.recipient;
    const review = await ensureFollowUp({
      task: mutation.task,
      meeting,
      recipient: { ...recipient, party_id: mutation.task.owner_party_id, action_type: "REVIEW" },
      contactPartyId: mutation.task.owner_party_id,
      kind: "CORRECTION_REVIEW",
      version: Number(object(mutation.task.metadata).closeout_version || 1),
      dueAt: new Date().toISOString(),
      body: correctionReviewInstruction(meeting, recipient, correctionText, evidenceId),
      executionReady: false,
    });
    correctionReviewFollowUpId = review.id;
    await mutateCloseoutTask(organization, meeting.id, async (task, metadata) => ({
      metadata: {
        ...metadata,
        correction_review_follow_up_ids: [...new Set([...list(metadata.correction_review_follow_up_ids), review.id])],
      },
      output: {},
    }));
  }

  return {
    status: responseKind === "ACKNOWLEDGED" ? "acknowledgement_recorded" : "correction_recorded",
    contract: CONTRACT,
    task: mutation.task,
    recipient: mutation.output.recipient,
    correction_review_follow_up_id: correctionReviewFollowUpId,
    acknowledgement_not_approval: true,
    attendance_inferred: false,
    correction_changes_minutes_automatically: false,
    external_authority_used: false,
  };
}

export async function refreshSecretaryMeetingCloseout({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const meeting = await requireCompletedMeeting(organization, payload.meeting_id || payload.meetingId);
  const task = await loadCloseoutTask(organization, meeting.id);
  if (!task) throw new Error("SECRETARY_MEETING_CLOSEOUT_NOT_FOUND");
  const now = iso(payload.now || payload.at || new Date().toISOString(), "refresh_at", { required: true });
  const metadata = object(task.metadata);
  const followUps = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,contact_party_id,status,metadata")
      .eq("organization_id", organization)
      .eq("task_id", task.id)
      .limit(500),
  );
  const distributionByParty = new Map();
  for (const row of followUps) {
    const rowMetadata = object(row.metadata);
    if (rowMetadata.secretary_meeting_closeout_kind === "MINUTES_DISTRIBUTION") distributionByParty.set(row.contact_party_id, row);
  }

  let recipients = list(metadata.recipients).map((recipient) => {
    const distribution = distributionByParty.get(recipient.party_id);
    const status = text(distribution?.status, 80).toUpperCase();
    return {
      ...recipient,
      distribution_status: status === "COMPLETED" ? "SENT" : status === "CANCELLED" ? "CANCELLED" : recipient.distribution_status,
      delivery_inferred: false,
    };
  });

  const chaseIds = [];
  const acknowledgementDue = Date.parse(metadata.acknowledgement_due_at || "");
  if (metadata.acknowledgement_required === true && Number.isFinite(acknowledgementDue) && Date.parse(now) >= acknowledgementDue) {
    for (const recipient of recipients) {
      if (["ACKNOWLEDGED", "CORRECTION_REQUESTED"].includes(recipient.acknowledgement_status)) continue;
      if (!["MESSAGE", "EMAIL"].includes(recipient.action_type)) continue;
      const chase = await ensureFollowUp({
        task,
        meeting,
        recipient,
        kind: "ACKNOWLEDGEMENT_CHASE",
        version: Number(metadata.closeout_version || 1),
        dueAt: now,
        body: acknowledgementChaseMessage(meeting, metadata.acknowledgement_due_at),
        executionReady: true,
      });
      chaseIds.push(chase.id);
    }
  }

  const allDistributed = recipients.length > 0 && recipients.every((recipient) => ["SENT", "CHANNEL_REVIEW_REQUIRED"].includes(recipient.distribution_status));
  const corrections = recipients.some((recipient) => recipient.acknowledgement_status === "CORRECTION_REQUESTED");
  const allResponses = recipients.every((recipient) => ["ACKNOWLEDGED", "CORRECTION_REQUESTED"].includes(recipient.acknowledgement_status));
  let state = metadata.closeout_state;
  let taskStatus = task.status;
  let completedAt = task.completed_at || null;
  if (corrections) {
    state = "CORRECTION_REVIEW";
    taskStatus = "IN_PROGRESS";
  } else if (metadata.acknowledgement_required === true && allResponses && allDistributed) {
    state = "CLOSED";
    taskStatus = "DONE";
    completedAt = completedAt || now;
  } else if (metadata.acknowledgement_required !== true && allDistributed) {
    state = "CLOSED";
    taskStatus = "DONE";
    completedAt = completedAt || now;
  } else if (chaseIds.length) {
    state = "ACKNOWLEDGEMENT_CHASING";
  } else if (allDistributed) {
    state = metadata.acknowledgement_required === true ? "AWAITING_ACKNOWLEDGEMENTS" : state;
  }

  const mutation = await mutateCloseoutTask(organization, meeting.id, async (currentTask, currentMetadata) => ({
    metadata: {
      ...currentMetadata,
      recipients,
      closeout_state: state,
      last_refreshed_at: now,
      acknowledgement_chase_follow_up_ids: [...new Set([...list(currentMetadata.acknowledgement_chase_follow_up_ids), ...chaseIds])],
      attendance_inferred: false,
      distribution_delivery_inferred: false,
      acknowledgement_not_approval: true,
      correction_changes_minutes_automatically: false,
    },
    task_patch: { status: taskStatus, completed_at: completedAt },
    output: { closeout_state: state, chase_follow_up_ids: chaseIds },
  }));

  return {
    status: state === "CLOSED" ? "closed" : "refreshed",
    contract: CONTRACT,
    task: mutation.task,
    closeout_state: state,
    chase_follow_up_ids: chaseIds,
    attendance_inferred: false,
    distribution_delivery_inferred: false,
    acknowledgement_not_approval: true,
    correction_changes_minutes_automatically: false,
    external_authority_used: false,
  };
}

export async function cancelSecretaryMeetingCloseout({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  actorPartyId(context);
  const meeting = await requireCompletedMeeting(organization, payload.meeting_id || payload.meetingId);
  const task = await loadCloseoutTask(organization, meeting.id);
  if (!task) throw new Error("SECRETARY_MEETING_CLOSEOUT_NOT_FOUND");
  if (task.status === "CANCELLED") return { status: "cancelled", contract: CONTRACT, task, replay_safe: true, external_authority_used: false };
  const cancelled = await cancelPendingCloseoutFollowUps({
    task,
    reason: text(payload.reason, 1000) || "Meeting closeout coordination cancelled",
  });
  const now = new Date().toISOString();
  const mutation = await mutateCloseoutTask(organization, meeting.id, async (currentTask, metadata) => ({
    metadata: {
      ...metadata,
      closeout_state: "CANCELLED",
      cancelled_at: now,
      cancellation_reason: text(payload.reason, 1000) || null,
      attendance_inferred: false,
      acknowledgement_not_approval: true,
      external_authority_used: false,
    },
    task_patch: { status: "CANCELLED", completed_at: now },
    output: { cancelled_follow_up_ids: cancelled },
  }));
  return {
    status: "cancelled",
    contract: CONTRACT,
    task: mutation.task,
    cancelled_follow_up_ids: cancelled,
    meeting_cancelled: false,
    attendance_inferred: false,
    acknowledgement_not_approval: true,
    external_authority_used: false,
  };
}

export default Object.freeze({
  start: startSecretaryMeetingCloseout,
  read: readSecretaryMeetingCloseout,
  recordResponse: recordSecretaryMeetingCloseoutResponse,
  refresh: refreshSecretaryMeetingCloseout,
  cancel: cancelSecretaryMeetingCloseout,
});
