import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveSecretaryAdministrativeCoverage,
  secretaryAdministrativeCoverageMetadata,
} from "@/lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_MEETING_MINUTES_REVISION_V1";
const CLOSEOUT_CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_MEETING_CLOSEOUT_V1";
const CLOSEOUT_SOURCE = "secretary_meeting_closeout";
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

function revisionFollowUpId(taskId, partyId, version) {
  return deterministicUuid(`avantiqo-secretary-meeting-closeout-follow-up-v1:${taskId}:${partyId}:MINUTES_REVISION_DISTRIBUTION:${version}`);
}

function sha256(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function iso(value, field, { required = false } = {}) {
  const raw = text(value, 180);
  if (!raw) {
    if (required) throw new Error(`SECRETARY_MEETING_MINUTES_REVISION_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_MEETING_MINUTES_REVISION_${field.toUpperCase()}_INVALID`);
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

async function requireMeeting(organization, meetingId) {
  const id = text(meetingId, 120);
  if (!id) throw new Error("SECRETARY_MEETING_MINUTES_REVISION_MEETING_REQUIRED");
  const meeting = await one(
    supabaseAdmin.from("secretary_meetings")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!meeting) throw new Error("SECRETARY_MEETING_MINUTES_REVISION_MEETING_NOT_FOUND");
  if (meeting.status !== "COMPLETED") throw new Error("SECRETARY_MEETING_MINUTES_REVISION_MEETING_NOT_COMPLETED");
  return meeting;
}

async function requireCloseoutTask(organization, meetingId) {
  const rows = await many(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organization)
      .eq("source", CLOSEOUT_SOURCE)
      .contains("metadata", { meeting_id: meetingId })
      .limit(2),
  );
  if (!rows.length) throw new Error("SECRETARY_MEETING_MINUTES_REVISION_CLOSEOUT_NOT_FOUND");
  if (rows.length !== 1) throw new Error("SECRETARY_MEETING_MINUTES_REVISION_CLOSEOUT_AMBIGUOUS");
  const task = rows[0];
  if (object(task.metadata).secretary_meeting_closeout_contract !== CLOSEOUT_CONTRACT) {
    throw new Error("SECRETARY_MEETING_MINUTES_REVISION_CLOSEOUT_CONTRACT_INVALID");
  }
  return task;
}

async function authorize({ organization, task, actor, instruction }) {
  const metadata = object(task.metadata);
  const canonicalOwner = text(metadata.canonical_owner_party_id || task.owner_party_id, 120);
  if (!canonicalOwner) throw new Error("SECRETARY_MEETING_MINUTES_REVISION_CANONICAL_OWNER_REQUIRED");
  const routing = await resolveSecretaryAdministrativeCoverage({
    organizationId: organization,
    ownerPartyId: canonicalOwner,
    scope: "MEETING_COORDINATION",
    instruction,
    at: new Date().toISOString(),
    requiresOwnerAuthority: false,
  });
  if (routing.coverage_routing_review_required === true) {
    throw new Error(`SECRETARY_MEETING_MINUTES_REVISION_COVERAGE_REVIEW_REQUIRED:${routing.routing_reason}`);
  }
  const operational = text(routing.operational_assignee_party_id, 120) || canonicalOwner;
  if (actor !== canonicalOwner && actor !== operational) {
    throw new Error("SECRETARY_MEETING_MINUTES_REVISION_ACTOR_NOT_AUTHORIZED");
  }
  return { canonicalOwner, operational, routing };
}

function currentMinutes(metadata, meeting) {
  const currentBody = text(metadata.current_minutes_body, 32000) || text(meeting.protocol, 32000) || text(meeting.executive_summary, 12000);
  if (!currentBody) throw new Error("SECRETARY_MEETING_MINUTES_REVISION_CURRENT_MINUTES_UNAVAILABLE");
  const version = Number(metadata.current_minutes_version || metadata.closeout_version || 1);
  if (!Number.isInteger(version) || version < 1) throw new Error("SECRETARY_MEETING_MINUTES_REVISION_CURRENT_VERSION_INVALID");
  return { body: currentBody, version };
}

function baselineHistory(metadata, meeting, current) {
  const existing = list(metadata.minutes_revision_history);
  if (existing.length) return existing;
  return [{
    version: 1,
    event: "ORIGINAL_RECORDED_MINUTES",
    minutes_body: text(meeting.protocol, 32000) || current.body,
    minutes_body_sha256: sha256(text(meeting.protocol, 32000) || current.body),
    evidence_id: text(object(meeting.metadata).evidence_id, 500) || null,
    source: "MEETING_CAPTURED_EVIDENCE",
    recorded_at: meeting.processed_at || meeting.ended_at || meeting.updated_at || meeting.created_at || null,
    recorded_by_party_id: text(object(meeting.metadata).created_by_party_id, 120) || null,
    correction_inferred: false,
  }];
}

function acknowledgementWindow(metadata, payload = {}, now = new Date()) {
  const required = metadata.acknowledgement_required === true;
  if (!required) return { required: false, due_at: null, defaulted: false };
  const supplied = iso(payload.acknowledgement_due_at || payload.acknowledgementDueAt, "acknowledgement_due_at");
  if (supplied) {
    if (Date.parse(supplied) <= now.getTime()) throw new Error("SECRETARY_MEETING_MINUTES_REVISION_ACKNOWLEDGEMENT_DUE_AT_PAST");
    return { required: true, due_at: supplied, defaulted: false };
  }
  return { required: true, due_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), defaulted: true };
}

async function meetingActionItems(organization, meetingId) {
  return many(
    supabaseAdmin.from("secretary_meeting_action_items")
      .select("owner_kind,title,due_at")
      .eq("organization_id", organization)
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: true })
      .limit(100),
  );
}

function renderValue(value, limit = 1200) {
  if (typeof value === "string") return text(value, limit);
  try {
    return text(JSON.stringify(value), limit);
  } catch {
    return text(value, limit);
  }
}

function revisedDistributionBody({ meeting, revisedMinutes, version, evidenceId, actionItems, acknowledgementDueAt, acknowledgementRequired }) {
  const decisions = list(meeting.decisions).slice(0, 50).map((item) => `- ${renderValue(item, 1200)}`);
  const actions = list(actionItems).slice(0, 60).map((item) => {
    const due = item.due_at ? `; due ${item.due_at}` : "";
    const owner = item.owner_kind ? `; owner ${item.owner_kind}` : "";
    return `- ${text(item.title, 500)}${owner}${due}`;
  });
  return text([
    `Revised meeting closeout v${version}: ${text(meeting.title, 800)}`,
    `Revision evidence: ${evidenceId}.`,
    `Revised meeting protocol / minutes:\n${revisedMinutes}`,
    decisions.length ? `Recorded decisions:\n${decisions.join("\n")}` : null,
    actions.length ? `Recorded action items:\n${actions.join("\n")}` : null,
    acknowledgementRequired
      ? `Please acknowledge receipt of revised minutes${acknowledgementDueAt ? ` by ${acknowledgementDueAt}` : ""}, or send any further factual correction.`
      : "Please send any further factual correction if needed.",
    "This revision is an evidence-backed administrative correction. It does not confirm attendance, RSVP, approval, acceptance, legal effect, or agreement by any recipient.",
  ].filter(Boolean).join("\n\n"), 32000);
}

async function cancelStaleCloseoutFollowUps({ organization, task, supersedesVersion }) {
  const rows = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,status,metadata")
      .eq("organization_id", organization)
      .eq("task_id", task.id)
      .eq("status", "PENDING")
      .limit(500),
  );
  const ids = rows.filter((row) => {
    const metadata = object(row.metadata);
    if (metadata.secretary_meeting_closeout !== true) return false;
    const version = Number(metadata.secretary_meeting_closeout_version || 1);
    return Number.isInteger(version) && version <= supersedesVersion;
  }).map((row) => row.id);
  if (!ids.length) return [];
  const now = new Date().toISOString();
  const update = await supabaseAdmin.from("secretary_follow_ups")
    .update({
      status: "CANCELLED",
      result: `Superseded by governed meeting-minutes revision v${supersedesVersion + 1}`,
      completed_at: now,
      updated_at: now,
    })
    .eq("organization_id", organization)
    .in("id", ids);
  if (update.error) throw update.error;
  return ids;
}

async function ensureRevisionDistribution({ organization, task, meeting, recipient, body, version, dueAt }) {
  const id = revisionFollowUpId(task.id, recipient.party_id, version);
  const existing = await one(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (existing) return existing;
  const actionType = text(recipient.action_type, 40).toUpperCase() || "REVIEW";
  const executable = ["MESSAGE", "EMAIL"].includes(actionType);
  const inserted = await supabaseAdmin.from("secretary_follow_ups").insert({
    id,
    organization_id: organization,
    entity_id: task.entity_id || null,
    owner_party_id: task.owner_party_id || null,
    contact_party_id: recipient.party_id,
    task_id: task.id,
    calendar_event_id: meeting.calendar_event_id || null,
    action_type: actionType,
    reason: text(body, 4000),
    status: "PENDING",
    due_at: dueAt,
    created_by_party_id: task.created_by_party_id || task.owner_party_id || null,
    metadata: {
      execution_owner: executable ? "SECRETARY" : "EXECUTIVE",
      execution_ready: executable,
      execution_instruction: text(body, 4000),
      secretary_owned: true,
      secretary_meeting_closeout: true,
      secretary_meeting_closeout_contract: CLOSEOUT_CONTRACT,
      secretary_meeting_minutes_revision_contract: CONTRACT,
      secretary_meeting_closeout_task_id: task.id,
      secretary_meeting_closeout_meeting_id: meeting.id,
      secretary_meeting_closeout_kind: "MINUTES_REVISION_DISTRIBUTION",
      secretary_meeting_closeout_version: version,
      secretary_coverage_scope: "FOLLOW_UP_COORDINATION",
      canonical_owner_party_id: object(task.metadata).canonical_owner_party_id || task.owner_party_id || null,
      operational_assignee_party_id: object(task.metadata).operational_assignee_party_id || task.owner_party_id || null,
      secretary_exact_message_body_source: executable ? EXACT_MESSAGE_SOURCE : null,
      secretary_exact_message_body: executable ? body : null,
      participant_record_recipient: recipient.roster_source === "MEETING_PARTICIPANT_RECORD",
      attendance_inferred: false,
      delivery_inferred: false,
      acknowledgement_not_approval: true,
      acceptance_inferred: false,
      agreement_inferred: false,
      revision_is_binding_acceptance: false,
      external_authority_used: false,
    },
  }).select("*").single();
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      return one(
        supabaseAdmin.from("secretary_follow_ups")
          .select("*")
          .eq("organization_id", organization)
          .eq("id", id)
          .single(),
      );
    }
    throw inserted.error;
  }
  return inserted.data;
}

async function updateTaskOptimistically({ organization, task, metadata, patch = {} }) {
  const updated = await supabaseAdmin.from("secretary_tasks")
    .update({ ...patch, metadata, updated_at: new Date().toISOString() })
    .eq("organization_id", organization)
    .eq("id", task.id)
    .eq("updated_at", task.updated_at)
    .select("*")
    .maybeSingle();
  if (updated.error) throw updated.error;
  return updated.data || null;
}

export async function reviseSecretaryMeetingMinutes({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const meeting = await requireMeeting(organization, payload.meeting_id || payload.meetingId);
  const revisedMinutes = text(payload.revised_minutes_body || payload.revisedMinutesBody, 32000);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  const correctionReason = text(payload.correction_reason || payload.correctionReason, 3000) || null;
  const supersedesVersion = Number(payload.supersedes_version ?? payload.supersedesVersion);
  if (!revisedMinutes) throw new Error("SECRETARY_MEETING_MINUTES_REVISION_BODY_REQUIRED");
  if (!evidenceId) throw new Error("SECRETARY_MEETING_MINUTES_REVISION_EVIDENCE_REQUIRED");
  if (!Number.isInteger(supersedesVersion) || supersedesVersion < 1) {
    throw new Error("SECRETARY_MEETING_MINUTES_REVISION_SUPERSEDES_VERSION_REQUIRED");
  }

  let task = await requireCloseoutTask(organization, meeting.id);
  const auth = await authorize({
    organization,
    task,
    actor,
    instruction: `Apply evidence-backed factual meeting-minutes revision superseding version ${supersedesVersion}`,
  });
  let metadata = object(task.metadata);
  let current = currentMinutes(metadata, meeting);
  const expectedBodyHash = sha256(revisedMinutes);
  let replaySafe = false;

  if (current.version === supersedesVersion) {
    const history = baselineHistory(metadata, meeting, current);
    const version = supersedesVersion + 1;
    const now = new Date().toISOString();
    const acknowledgement = acknowledgementWindow(metadata, payload, new Date());
    const revision = {
      version,
      event: "EVIDENCE_BACKED_FACTUAL_REVISION",
      minutes_body: revisedMinutes,
      minutes_body_sha256: expectedBodyHash,
      evidence_id: evidenceId,
      correction_reason: correctionReason,
      supersedes_version: supersedesVersion,
      recorded_at: now,
      recorded_by_party_id: actor,
      canonical_owner_party_id: auth.canonicalOwner,
      correction_inferred: false,
      attendance_inferred: false,
      approval_inferred: false,
      agreement_inferred: false,
    };
    const recipients = list(metadata.recipients).map((recipient) => ({
      ...recipient,
      distribution_status: "NOT_QUEUED",
      acknowledgement_status: "PENDING",
      acknowledged_at: null,
      acknowledgement_evidence_id: null,
      attendance_inferred: false,
      delivery_inferred: false,
      approval_inferred: false,
    }));
    const nextMetadata = {
      ...metadata,
      closeout_version: version,
      current_minutes_version: version,
      current_minutes_body: revisedMinutes,
      current_minutes_body_sha256: expectedBodyHash,
      minutes_revision_history: [...history, revision].slice(-200),
      closeout_state: "REVISION_DISTRIBUTION_PENDING",
      recipients,
      acknowledgement_due_at: acknowledgement.due_at,
      acknowledgement_deadline_defaulted: acknowledgement.defaulted,
      distribution_follow_up_ids: [],
      acknowledgement_chase_follow_up_ids: [],
      correction_review_follow_up_ids: [],
      latest_revision_evidence_id: evidenceId,
      latest_revision_recorded_at: now,
      latest_revision_recorded_by_party_id: actor,
      ...secretaryAdministrativeCoverageMetadata(auth.routing),
      original_meeting_protocol_mutated: false,
      correction_inferred: false,
      attendance_inferred: false,
      distribution_delivery_inferred: false,
      acknowledgement_not_approval: true,
      approval_authority_delegated: false,
      binding_authority_delegated: false,
      platform_permissions_mutated: false,
      external_authority_used: false,
    };
    const updated = await updateTaskOptimistically({
      organization,
      task,
      metadata: nextMetadata,
      patch: { status: "IN_PROGRESS", completed_at: null },
    });
    if (!updated) throw new Error("SECRETARY_MEETING_MINUTES_REVISION_CONCURRENT_UPDATE_RETRY_REQUIRED");
    task = updated;
    metadata = object(task.metadata);
    current = currentMinutes(metadata, meeting);
  } else if (current.version === supersedesVersion + 1) {
    const latest = list(metadata.minutes_revision_history).find((row) => Number(row.version) === current.version);
    if (!latest || latest.evidence_id !== evidenceId || latest.minutes_body_sha256 !== expectedBodyHash) {
      throw new Error("SECRETARY_MEETING_MINUTES_REVISION_STALE_REVISION_REJECTED");
    }
    replaySafe = true;
  } else {
    throw new Error("SECRETARY_MEETING_MINUTES_REVISION_STALE_REVISION_REJECTED");
  }

  const currentVersion = current.version;
  const cancelledFollowUpIds = await cancelStaleCloseoutFollowUps({
    organization,
    task,
    supersedesVersion,
  });
  const actionItems = await meetingActionItems(organization, meeting.id);
  const body = revisedDistributionBody({
    meeting,
    revisedMinutes,
    version: currentVersion,
    evidenceId,
    actionItems,
    acknowledgementDueAt: metadata.acknowledgement_due_at || null,
    acknowledgementRequired: metadata.acknowledgement_required === true,
  });

  const distributionIds = [];
  for (const recipient of list(metadata.recipients)) {
    const followUp = await ensureRevisionDistribution({
      organization,
      task,
      meeting,
      recipient,
      body,
      version: currentVersion,
      dueAt: new Date().toISOString(),
    });
    distributionIds.push(followUp.id);
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    task = await requireCloseoutTask(organization, meeting.id);
    metadata = object(task.metadata);
    if (Number(metadata.current_minutes_version || metadata.closeout_version || 1) !== currentVersion) {
      throw new Error("SECRETARY_MEETING_MINUTES_REVISION_STALE_DISTRIBUTION_FENCED");
    }
    const recipients = list(metadata.recipients).map((recipient) => ({
      ...recipient,
      distribution_status: ["MESSAGE", "EMAIL"].includes(text(recipient.action_type, 40).toUpperCase())
        ? "QUEUED"
        : "CHANNEL_REVIEW_REQUIRED",
      delivery_inferred: false,
    }));
    const nextMetadata = {
      ...metadata,
      closeout_state: "REVISION_DISTRIBUTION_QUEUED",
      recipients,
      distribution_follow_up_ids: distributionIds,
      latest_revision_distribution_queued_at: new Date().toISOString(),
      latest_revision_distribution_body_sha256: sha256(body),
      original_meeting_protocol_mutated: false,
      correction_inferred: false,
      attendance_inferred: false,
      distribution_delivery_inferred: false,
      acknowledgement_not_approval: true,
      approval_authority_delegated: false,
      binding_authority_delegated: false,
      platform_permissions_mutated: false,
      external_authority_used: false,
    };
    const updated = await updateTaskOptimistically({
      organization,
      task,
      metadata: nextMetadata,
      patch: { status: "IN_PROGRESS", completed_at: null },
    });
    if (updated) {
      task = updated;
      break;
    }
    if (attempt === 3) throw new Error("SECRETARY_MEETING_MINUTES_REVISION_CONCURRENT_UPDATE_RETRY_REQUIRED");
  }

  const originalMeeting = await requireMeeting(organization, meeting.id);
  return {
    status: "revised",
    contract: CONTRACT,
    task,
    meeting_id: meeting.id,
    current_minutes_version: currentVersion,
    supersedes_version: supersedesVersion,
    revision_evidence_id: evidenceId,
    distribution_follow_up_ids: distributionIds,
    cancelled_stale_follow_up_ids: cancelledFollowUpIds,
    replay_safe: replaySafe,
    history_preserved: true,
    stale_revision_fenced: true,
    stale_distribution_fenced: true,
    original_meeting_protocol_mutated: originalMeeting.protocol !== meeting.protocol,
    correction_inferred: false,
    attendance_inferred: false,
    acknowledgement_not_approval: true,
    approval_authority_delegated: false,
    binding_authority_delegated: false,
    platform_permissions_mutated: false,
    external_authority_used: false,
  };
}

export default Object.freeze({
  revise: reviseSecretaryMeetingMinutes,
});
