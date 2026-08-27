import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import { supersedeSecretaryExecutiveDecisionGoverned } from "../lib/operator/secretary/SecretaryExecutiveDecisionRegisterGovernedRuntime.js";
import {
  linkSecretaryDecisionFollowThrough,
  listSecretaryExecutiveDecisions,
  readSecretaryExecutiveDecision,
  recordSecretaryExecutiveDecision,
  retractSecretaryExecutiveDecision,
  syncSecretaryMeetingDecisions,
} from "../lib/operator/secretary/SecretaryExecutiveDecisionRegisterRuntime.js";

const organizationId = randomUUID();
const ownerPartyId = randomUUID();
const meetingId = randomUUID();
const followThroughTaskId = randomUUID();
const context = {
  organizationId,
  timezone: "Asia/Bangkok",
  actor: { partyId: ownerPartyId },
  metadata: { partyId: ownerPartyId },
};

async function one(result, label = "query") {
  const resolved = await result;
  if (resolved.error) throw new Error(`${label}:${resolved.error.code || "UNKNOWN"}:${resolved.error.message || "ERROR"}`);
  return resolved.data || null;
}

async function expectError(fn, expected) {
  let error = null;
  try {
    await fn();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, `Expected error ${expected}`);
  assert.equal(error.message, expected);
}

await one(
  supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Decision Register Local Cert" }).select("*").single(),
  "organization",
);
await one(
  supabaseAdmin.from("parties").insert({
    id: ownerPartyId,
    organization_id: organizationId,
    display_name: "Executive Owner",
    party_type: "PERSON",
    status: "ACTIVE",
  }).select("*").single(),
  "party",
);
await one(
  supabaseAdmin.from("secretary_settings").insert({
    organization_id: organizationId,
    default_timezone: "Asia/Bangkok",
    booking_policy: { owner_party_id: ownerPartyId },
    metadata: { owner_party_id: ownerPartyId },
  }).select("*").single(),
  "settings",
);
await one(
  supabaseAdmin.from("secretary_tasks").insert({
    id: followThroughTaskId,
    organization_id: organizationId,
    owner_party_id: ownerPartyId,
    title: "Implement cash reserve reporting",
    details: "Add the explicitly assigned reporting work for the recorded cash reserve decision.",
    status: "OPEN",
    priority: "NORMAL",
    source: "secretary",
    created_by_party_id: ownerPartyId,
    metadata: { explicit_follow_through_fixture: true },
  }).select("*").single(),
  "follow-through-task",
);
await one(
  supabaseAdmin.from("secretary_meetings").insert({
    id: meetingId,
    organization_id: organizationId,
    title: "Project Atlas Steering Committee",
    status: "COMPLETED",
    started_at: "2035-04-10T01:00:00Z",
    ended_at: "2035-04-10T02:00:00Z",
    timezone: "Asia/Bangkok",
    capture_authorized: true,
    decisions: ["Launch Project Atlas in Q4", "Use weekly steering review"],
    processed_at: "2035-04-10T02:10:00Z",
    metadata: { certification_fixture: true },
  }).select("*").single(),
  "meeting",
);

await expectError(
  () => recordSecretaryExecutiveDecision({
    context,
    payload: {
      decision_text: "Maintain a minimum cash reserve of USD 500,000.",
      decided_at: "2035-04-10T08:00:00Z",
    },
  }),
  "SECRETARY_DECISION_REGISTER_EVIDENCE_REQUIRED",
);

const directPayload = {
  decision_text: "Maintain a minimum cash reserve of USD 500,000.",
  evidence_id: "decision-direct-evidence-v1",
  decided_at: "2035-04-10T08:00:00Z",
  source_reference: "minutes:board-resolution-v1",
  decision_owner_party_id: ownerPartyId,
};
const direct = await recordSecretaryExecutiveDecision({ context, payload: directPayload });
assert.equal(direct.status, "recorded");
assert.equal(direct.replay_safe, false);
assert.equal(direct.decision.state, "CURRENT");
assert.equal(direct.decision.current_version.decision_text, directPayload.decision_text);
assert.equal(direct.decision.current_version.decision_timestamp_inferred, false);
assert.equal(direct.decision.current_version.decision_made_by_secretary, false);
assert.equal(direct.decision_authority_created, false);

const directReplay = await recordSecretaryExecutiveDecision({ context, payload: directPayload });
assert.equal(directReplay.replay_safe, true);
assert.equal(directReplay.decision.decision_id, direct.decision.decision_id);

const meetingSync = await syncSecretaryMeetingDecisions({ context, payload: { meeting_id: meetingId } });
assert.equal(meetingSync.status, "completed");
assert.equal(meetingSync.recorded_decision_count, 2);
assert.equal(meetingSync.meeting_decision_record_used_as_evidence, true);
assert.equal(meetingSync.decision_timestamp_inferred, false);
for (const item of meetingSync.decisions) {
  assert.equal(item.replay_safe, false);
  assert.equal(item.decision.current_version.source_kind, "FINALIZED_MEETING_DECISION_RECORD");
  assert.equal(item.decision.current_version.decided_at, null);
  assert.equal(item.decision.current_version.decision_timestamp_inferred, false);
}

const meetingReplay = await syncSecretaryMeetingDecisions({ context, payload: { meeting_id: meetingId } });
assert.equal(meetingReplay.recorded_decision_count, 2);
assert.ok(meetingReplay.decisions.every((item) => item.replay_safe === true));
assert.deepEqual(
  meetingReplay.decisions.map((item) => item.decision.decision_id).sort(),
  meetingSync.decisions.map((item) => item.decision.decision_id).sort(),
);

const v1 = direct.decision.current_version.version_id;
const supersedePayload = {
  decision_id: direct.decision.decision_id,
  supersedes_version_id: v1,
  replacement_decision_text: "Maintain a minimum cash reserve of USD 750,000.",
  evidence_id: "decision-direct-evidence-v2",
  decided_at: "2035-05-01T08:00:00Z",
  source_reference: "minutes:board-resolution-v2",
  decision_owner_party_id: ownerPartyId,
};
const superseded = await supersedeSecretaryExecutiveDecisionGoverned({ context, payload: supersedePayload });
assert.equal(superseded.status, "superseded");
assert.equal(superseded.replay_safe, false);
assert.equal(superseded.decision.state, "CURRENT");
assert.equal(superseded.decision.versions.length, 2);
assert.equal(superseded.decision.versions.find((row) => row.version_id === v1)?.state, "SUPERSEDED");
assert.equal(superseded.decision.current_version.decision_text, supersedePayload.replacement_decision_text);
const v2 = superseded.decision.current_version.version_id;

const supersedeReplay = await supersedeSecretaryExecutiveDecisionGoverned({ context, payload: supersedePayload });
assert.equal(supersedeReplay.replay_safe, true);
assert.equal(supersedeReplay.decision.current_version.version_id, v2);

await expectError(
  () => supersedeSecretaryExecutiveDecisionGoverned({
    context,
    payload: {
      ...supersedePayload,
      replacement_decision_text: "Maintain a minimum cash reserve of USD 900,000.",
      evidence_id: "decision-conflicting-stale-v3",
      decided_at: "2035-05-02T08:00:00Z",
    },
  }),
  "SECRETARY_DECISION_REGISTER_STALE_SUPERSESSION_REJECTED",
);

const linked = await linkSecretaryDecisionFollowThrough({
  context,
  payload: {
    decision_id: direct.decision.decision_id,
    current_version_id: v2,
    follow_through_task_id: followThroughTaskId,
    evidence_id: "decision-follow-through-link-v1",
  },
});
assert.equal(linked.status, "linked");
assert.equal(linked.replay_safe, false);
assert.equal(linked.follow_through_inferred, false);
assert.equal(linked.decision.current_version.follow_through_task_id, followThroughTaskId);

const linkedReplay = await linkSecretaryDecisionFollowThrough({
  context,
  payload: {
    decision_id: direct.decision.decision_id,
    current_version_id: v2,
    follow_through_task_id: followThroughTaskId,
    evidence_id: "decision-follow-through-link-v1",
  },
});
assert.equal(linkedReplay.replay_safe, true);

const retracted = await retractSecretaryExecutiveDecision({
  context,
  payload: {
    decision_id: direct.decision.decision_id,
    retracts_version_id: v2,
    evidence_id: "decision-retraction-v1",
    retracted_at: "2035-06-01T08:00:00Z",
    source_reference: "minutes:board-resolution-withdrawal-v1",
    reason: "Executive explicitly withdrew the cash reserve decision.",
  },
});
assert.equal(retracted.status, "retracted");
assert.equal(retracted.replay_safe, false);
assert.equal(retracted.decision.state, "RETRACTED");
assert.equal(retracted.decision.current_version, null);
assert.equal(retracted.decision.versions.find((row) => row.version_id === v2)?.state, "RETRACTED");

const retractedReplay = await retractSecretaryExecutiveDecision({
  context,
  payload: {
    decision_id: direct.decision.decision_id,
    retracts_version_id: v2,
    evidence_id: "decision-retraction-v1",
    retracted_at: "2035-06-01T08:00:00Z",
    source_reference: "minutes:board-resolution-withdrawal-v1",
    reason: "Executive explicitly withdrew the cash reserve decision.",
  },
});
assert.equal(retractedReplay.replay_safe, true);

await expectError(
  () => retractSecretaryExecutiveDecision({
    context,
    payload: {
      decision_id: direct.decision.decision_id,
      retracts_version_id: v1,
      evidence_id: "decision-stale-retraction",
      retracted_at: "2035-06-02T08:00:00Z",
    },
  }),
  "SECRETARY_DECISION_REGISTER_STALE_RETRACTION_REJECTED",
);

const readDirect = await readSecretaryExecutiveDecision({
  context,
  payload: { decision_id: direct.decision.decision_id },
});
assert.equal(readDirect.status, "completed");
assert.equal(readDirect.evidence_only, true);
assert.equal(readDirect.decision.state, "RETRACTED");
assert.equal(readDirect.decision.versions.length, 2);
assert.ok(readDirect.decision.history.some((row) => row.event === "DECISION_RECORDED"));
assert.ok(readDirect.decision.history.some((row) => row.event === "DECISION_SUPERSEDED"));
assert.ok(readDirect.decision.history.some((row) => row.event === "FOLLOW_THROUGH_LINKED"));
assert.ok(readDirect.decision.history.some((row) => row.event === "DECISION_RETRACTED"));

const register = await listSecretaryExecutiveDecisions({ context, payload: { limit: 50 } });
assert.equal(register.status, "completed");
assert.equal(register.summary.returned_lineages, 3);
assert.equal(register.summary.current_lineages, 2);
assert.equal(register.summary.retracted_lineages, 1);
assert.equal(register.current_decisions.length, 2);
assert.equal(register.retracted_decisions.length, 1);
assert.equal(register.summary.version_count, 4);
assert.equal(register.decision_timestamp_inferred, false);
assert.equal(register.decision_inferred, false);
assert.equal(register.decision_made_by_secretary, false);
assert.equal(register.decision_authority_created, false);
assert.equal(register.approval_authority_delegated, false);
assert.equal(register.binding_authority_delegated, false);
assert.equal(register.platform_permissions_mutated, false);
assert.equal(register.external_authority_used, false);

const storedMeeting = await one(
  supabaseAdmin.from("secretary_meetings").select("decisions").eq("organization_id", organizationId).eq("id", meetingId).single(),
  "stored-meeting",
);
assert.deepEqual(storedMeeting.decisions, ["Launch Project Atlas in Q4", "Use weekly steering review"]);

const storedFollowThrough = await one(
  supabaseAdmin.from("secretary_tasks").select("id,status,source").eq("organization_id", organizationId).eq("id", followThroughTaskId).single(),
  "stored-follow-through",
);
assert.equal(storedFollowThrough.status, "OPEN");
assert.equal(storedFollowThrough.source, "secretary");

console.log("SECRETARY_DECISION_REGISTER_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_DECISION_REGISTER_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_DECISION_REGISTER_DIRECT_REPLAY_SAFE=true");
console.log("SECRETARY_DECISION_REGISTER_MEETING_SYNC_DURABLE=true");
console.log("SECRETARY_DECISION_REGISTER_MEETING_SYNC_REPLAY_SAFE=true");
console.log("SECRETARY_DECISION_REGISTER_MEETING_TIMESTAMP_INFERRED=false");
console.log("SECRETARY_DECISION_REGISTER_VERSION_HISTORY_PRESERVED=true");
console.log("SECRETARY_DECISION_REGISTER_SUPERSESSION_REPLAY_SAFE=true");
console.log("SECRETARY_DECISION_REGISTER_STALE_SUPERSESSION_FENCED=true");
console.log("SECRETARY_DECISION_REGISTER_FOLLOW_THROUGH_EXPLICIT=true");
console.log("SECRETARY_DECISION_REGISTER_RETRACTION_REPLAY_SAFE=true");
console.log("SECRETARY_DECISION_REGISTER_STALE_RETRACTION_FENCED=true");
console.log("SECRETARY_DECISION_REGISTER_DECISION_INFERRED=false");
console.log("SECRETARY_DECISION_REGISTER_DECISION_MADE_BY_SECRETARY=false");
console.log("SECRETARY_DECISION_REGISTER_DECISION_AUTHORITY_CREATED=false");
console.log("SECRETARY_DECISION_REGISTER_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_DECISION_REGISTER_BINDING_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_DECISION_REGISTER_APPROVAL_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
