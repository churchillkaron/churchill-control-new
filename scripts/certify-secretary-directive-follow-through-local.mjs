import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import {
  readSecretaryExecutiveDirective,
  recordSecretaryExecutiveDirective,
  supersedeSecretaryExecutiveDirective,
} from "../lib/operator/secretary/SecretaryExecutiveDirectiveRegisterRuntime.js";
import {
  cancelSecretaryDirectiveFollowThrough,
  completeSecretaryDirectiveFollowThrough,
  listSecretaryDirectiveFollowThrough,
  readSecretaryDirectiveFollowThrough,
  recordSecretaryDirectiveAcknowledgement,
  recordSecretaryDirectiveProgress,
  refreshSecretaryDirectiveFollowThrough,
  startSecretaryDirectiveFollowThrough,
} from "../lib/operator/secretary/SecretaryDirectiveFollowThroughRuntime.js";

const organizationId = randomUUID();
const ownerPartyId = randomUUID();
const targetPartyId = randomUUID();
const executionTaskId = randomUUID();
const context = {
  organizationId,
  timezone: "Asia/Bangkok",
  actor: { partyId: ownerPartyId },
  metadata: { partyId: ownerPartyId },
};

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

async function rejectsMessage(run, message) {
  let caught = null;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `Expected rejection ${message}`);
  assert.equal(caught.message, message);
}

await one(supabaseAdmin.from("organizations").insert({
  id: organizationId,
  name: "Secretary Directive Follow Through Local Cert",
}).select("*").single());

const partiesInsert = await supabaseAdmin.from("parties").insert([
  {
    id: ownerPartyId,
    organization_id: organizationId,
    display_name: "Executive Owner",
    party_type: "PERSON",
    status: "ACTIVE",
  },
  {
    id: targetPartyId,
    organization_id: organizationId,
    display_name: "Operations Manager",
    legal_name: "Operations Manager",
    email: "operations@example.test",
    party_type: "PERSON",
    status: "ACTIVE",
  },
]).select("*");
if (partiesInsert.error) throw partiesInsert.error;

await one(supabaseAdmin.from("secretary_settings").insert({
  organization_id: organizationId,
  default_timezone: "Asia/Bangkok",
  appointment_duration_minutes: 30,
  business_hours: {},
  booking_policy: { owner_party_id: ownerPartyId },
  metadata: { owner_party_id: ownerPartyId },
}).select("*").single());

await one(supabaseAdmin.from("secretary_contact_profiles").insert({
  organization_id: organizationId,
  party_id: targetPartyId,
  preferred_channel: "EMAIL",
  allow_calls: true,
  allow_messages: true,
  metadata: {},
}).select("*").single());

await one(supabaseAdmin.from("secretary_tasks").insert({
  id: executionTaskId,
  organization_id: organizationId,
  owner_party_id: targetPartyId,
  title: "Prepare supplier comparison",
  details: "Existing execution work linked to the executive directive.",
  status: "OPEN",
  priority: "NORMAL",
  due_at: "2035-05-10T12:00:00Z",
  source: "secretary_staff_delegation",
  created_by_party_id: ownerPartyId,
  metadata: { certification_fixture: true },
}).select("*").single());

const lowDirective = await recordSecretaryExecutiveDirective({
  context,
  payload: {
    instruction_text: "Prepare the revised supplier comparison and send me the final document.",
    issuer_party_id: ownerPartyId,
    target_party_id: targetPartyId,
    due_at: "2035-05-10T12:00:00Z",
    evidence_id: "directive-follow-through-low-evidence",
    instructed_at: "2035-05-10T09:55:00Z",
    execution_task_id: executionTaskId,
  },
});
assert.equal(lowDirective.status, "recorded");
const lowDirectiveId = lowDirective.directive.directive_id;
const lowVersionId = lowDirective.directive.current_version.version_id;

const started = await startSecretaryDirectiveFollowThrough({
  context,
  payload: {
    directive_id: lowDirectiveId,
    current_version_id: lowVersionId,
    evidence_id: "follow-through-start-evidence",
    started_at: "2035-05-10T10:00:00Z",
    delivery_mode: "DELIVER_EXACT",
    acknowledgement_due_at: "2035-05-10T10:30:00Z",
    progress_check_at: "2035-05-10T11:00:00Z",
  },
});
assert.equal(started.status, "started");
assert.equal(started.run.state, "ACTIVE");
assert.equal(started.run.target_party_id, targetPartyId);
assert.equal(started.run.delivery_auto_execution_allowed, true);
assert.equal(started.run.high_authority_instruction, false);
assert.equal(started.directive_ledger_task_is_execution_work, false);
assert.equal(started.acknowledgement_inferred, false);
assert.equal(started.acceptance_inferred, false);
assert.equal(started.commitment_inferred, false);
assert.equal(started.completion_inferred, false);

const startedKinds = new Map(started.follow_ups.map((row) => [row.metadata.directive_follow_through_kind, row]));
assert.equal(startedKinds.get("DIRECTIVE_DELIVERY")?.action_type, "EMAIL");
assert.equal(startedKinds.get("DIRECTIVE_DELIVERY")?.metadata.execution_ready, true);
assert.equal(startedKinds.get("ACKNOWLEDGEMENT_CHASE")?.action_type, "EMAIL");
assert.equal(startedKinds.get("PROGRESS_CHECK")?.action_type, "EMAIL");
assert.equal(startedKinds.get("DUE_REVIEW")?.action_type, "REVIEW");
assert.equal(startedKinds.get("DUE_REVIEW")?.metadata.execution_ready, false);

const startedReplay = await startSecretaryDirectiveFollowThrough({
  context,
  payload: {
    directive_id: lowDirectiveId,
    current_version_id: lowVersionId,
    evidence_id: "follow-through-start-evidence",
    started_at: "2035-05-10T10:00:00Z",
    delivery_mode: "DELIVER_EXACT",
    acknowledgement_due_at: "2035-05-10T10:30:00Z",
    progress_check_at: "2035-05-10T11:00:00Z",
  },
});
assert.equal(startedReplay.replay_safe, true);

const acknowledgement = await recordSecretaryDirectiveAcknowledgement({
  context,
  payload: {
    directive_id: lowDirectiveId,
    current_version_id: lowVersionId,
    evidence_id: "target-ack-evidence",
    responded_at: "2035-05-10T10:15:00Z",
    response_kind: "ACKNOWLEDGED",
    response_text: "Received and understood.",
  },
});
assert.equal(acknowledgement.status, "response_recorded");
assert.equal(acknowledgement.run.acknowledged, true);
assert.equal(acknowledgement.run.latest_response_kind, "ACKNOWLEDGED");
assert.equal(acknowledgement.acknowledgement_is_acceptance, false);
assert.equal(acknowledgement.acknowledgement_is_commitment, false);
assert.equal(acknowledgement.acknowledgement_is_completion, false);
const ackChaseAfterResponse = acknowledgement.follow_ups.find((row) => row.metadata.directive_follow_through_kind === "ACKNOWLEDGEMENT_CHASE");
assert.equal(ackChaseAfterResponse.status, "CANCELLED");

const acknowledgementReplay = await recordSecretaryDirectiveAcknowledgement({
  context,
  payload: {
    directive_id: lowDirectiveId,
    current_version_id: lowVersionId,
    evidence_id: "target-ack-evidence",
    responded_at: "2035-05-10T10:15:00Z",
    response_kind: "ACKNOWLEDGED",
    response_text: "Received and understood.",
  },
});
assert.equal(acknowledgementReplay.replay_safe, true);

const progress = await recordSecretaryDirectiveProgress({
  context,
  payload: {
    directive_id: lowDirectiveId,
    current_version_id: lowVersionId,
    evidence_id: "target-progress-evidence",
    recorded_at: "2035-05-10T10:45:00Z",
    status_text: "Comparison is drafted and undergoing final checks.",
    blockers: "None stated.",
    expected_completion_at: "2035-05-10T11:30:00Z",
  },
});
assert.equal(progress.status, "progress_recorded");
assert.equal(progress.run.progress_history.length, 1);
assert.equal(progress.run.progress_history[0].completion_inferred, false);
assert.equal(progress.progress_is_completion, false);

await one(supabaseAdmin.from("secretary_tasks")
  .update({ status: "DONE", completed_at: "2035-05-10T11:10:00Z", updated_at: "2035-05-10T11:10:00Z" })
  .eq("organization_id", organizationId)
  .eq("id", executionTaskId)
  .select("*")
  .single());

const refreshed = await refreshSecretaryDirectiveFollowThrough({
  context,
  payload: {
    directive_id: lowDirectiveId,
    refreshed_at: "2035-05-10T11:15:00Z",
  },
});
assert.equal(refreshed.status, "refreshed");
assert.equal(refreshed.linked_execution_terminal, true);
assert.equal(refreshed.linked_execution_terminal_is_completion, false);
assert.equal(refreshed.directive_state, "CURRENT");
assert.equal(refreshed.execution.completion_inferred, false);
const completionReview = refreshed.follow_ups.find((row) => row.metadata.directive_follow_through_kind === "EXECUTION_COMPLETION_EVIDENCE_REVIEW");
assert.ok(completionReview);
assert.equal(completionReview.action_type, "REVIEW");
assert.equal(completionReview.metadata.execution_ready, false);

const registerBeforeCompletion = await readSecretaryExecutiveDirective({
  context,
  payload: { directive_id: lowDirectiveId },
});
assert.equal(registerBeforeCompletion.directive.state, "CURRENT");
assert.equal(registerBeforeCompletion.directive.completion_inferred, false);

const completed = await completeSecretaryDirectiveFollowThrough({
  context,
  payload: {
    directive_id: lowDirectiveId,
    current_version_id: lowVersionId,
    evidence_id: "directive-explicit-completion-evidence",
    completed_at: "2035-05-10T11:40:00Z",
    result: "Target explicitly confirmed the directive deliverable was completed.",
  },
});
assert.equal(completed.status, "completed");
assert.equal(completed.run.state, "COMPLETED");
assert.equal(completed.directive_state, "COMPLETED");
assert.equal(completed.directive_completion_evidence_accepted, true);
assert.equal(completed.directive_completion_inferred, false);
assert.equal(completed.follow_ups.filter((row) => row.status === "PENDING").length, 0);

const completedReplay = await completeSecretaryDirectiveFollowThrough({
  context,
  payload: {
    directive_id: lowDirectiveId,
    current_version_id: lowVersionId,
    evidence_id: "directive-explicit-completion-evidence",
    completed_at: "2035-05-10T11:40:00Z",
    result: "Target explicitly confirmed the directive deliverable was completed.",
  },
});
assert.equal(completedReplay.replay_safe, true);

const registerAfterCompletion = await readSecretaryExecutiveDirective({
  context,
  payload: { directive_id: lowDirectiveId },
});
assert.equal(registerAfterCompletion.directive.state, "COMPLETED");

const highDirective = await recordSecretaryExecutiveDirective({
  context,
  payload: {
    instruction_text: "Pay this invoice only after the existing approval gate clears.",
    issuer_party_id: ownerPartyId,
    target_party_id: targetPartyId,
    due_at: "2035-05-11T12:00:00Z",
    evidence_id: "directive-follow-through-high-evidence",
    instructed_at: "2035-05-11T09:00:00Z",
  },
});
const highDirectiveId = highDirective.directive.directive_id;
const highVersionId = highDirective.directive.current_version.version_id;

const highStarted = await startSecretaryDirectiveFollowThrough({
  context,
  payload: {
    directive_id: highDirectiveId,
    current_version_id: highVersionId,
    evidence_id: "high-follow-through-start-evidence",
    started_at: "2035-05-11T09:05:00Z",
    delivery_mode: "DELIVER_EXACT",
    acknowledgement_due_at: "2035-05-11T10:00:00Z",
  },
});
assert.equal(highStarted.run.high_authority_instruction, true);
assert.equal(highStarted.run.delivery_auto_execution_allowed, false);
assert.equal(highStarted.high_authority_delivery_review_required, true);
const highDelivery = highStarted.follow_ups.find((row) => row.metadata.directive_follow_through_kind === "DIRECTIVE_DELIVERY");
assert.equal(highDelivery.action_type, "REVIEW");
assert.equal(highDelivery.metadata.execution_ready, false);
assert.equal(highDelivery.metadata.high_authority_review_required, true);
assert.equal(highStarted.payment_authority_created, false);
assert.equal(highStarted.signing_authority_created, false);
assert.equal(highStarted.booking_authority_created, false);
assert.equal(highStarted.approval_authority_delegated, false);
assert.equal(highStarted.binding_authority_delegated, false);

const highCancelled = await cancelSecretaryDirectiveFollowThrough({
  context,
  payload: {
    directive_id: highDirectiveId,
    evidence_id: "cancel-follow-through-only-evidence",
    cancelled_at: "2035-05-11T09:20:00Z",
    reason: "Executive asked the Secretary to stop chasing this instruction for now.",
  },
});
assert.equal(highCancelled.status, "cancelled");
assert.equal(highCancelled.run.state, "FOLLOW_THROUGH_CANCELLED");
assert.equal(highCancelled.directive_cancelled, false);
const highCancelledReplay = await cancelSecretaryDirectiveFollowThrough({
  context,
  payload: {
    directive_id: highDirectiveId,
    evidence_id: "cancel-follow-through-only-evidence",
    cancelled_at: "2035-05-11T09:20:00Z",
    reason: "Executive asked the Secretary to stop chasing this instruction for now.",
  },
});
assert.equal(highCancelledReplay.replay_safe, true);
const highRegisterAfterFollowThroughCancel = await readSecretaryExecutiveDirective({
  context,
  payload: { directive_id: highDirectiveId },
});
assert.equal(highRegisterAfterFollowThroughCancel.directive.state, "CURRENT");

const noTargetDirective = await recordSecretaryExecutiveDirective({
  context,
  payload: {
    instruction_text: "Review the draft later.",
    issuer_party_id: ownerPartyId,
    evidence_id: "directive-no-target-evidence",
    instructed_at: "2035-05-12T09:00:00Z",
  },
});
await rejectsMessage(
  () => startSecretaryDirectiveFollowThrough({
    context,
    payload: {
      directive_id: noTargetDirective.directive.directive_id,
      current_version_id: noTargetDirective.directive.current_version.version_id,
      evidence_id: "no-target-follow-through-start",
      started_at: "2035-05-12T09:05:00Z",
    },
  }),
  "SECRETARY_DIRECTIVE_FOLLOW_THROUGH_EXPLICIT_TARGET_PARTY_REQUIRED",
);

const supersededDirective = await recordSecretaryExecutiveDirective({
  context,
  payload: {
    instruction_text: "Send the first draft to the owner.",
    issuer_party_id: ownerPartyId,
    target_party_id: targetPartyId,
    due_at: "2035-05-13T12:00:00Z",
    evidence_id: "directive-supersede-base-evidence",
    instructed_at: "2035-05-13T09:00:00Z",
  },
});
const supersededDirectiveId = supersededDirective.directive.directive_id;
const supersededVersionId = supersededDirective.directive.current_version.version_id;
await startSecretaryDirectiveFollowThrough({
  context,
  payload: {
    directive_id: supersededDirectiveId,
    current_version_id: supersededVersionId,
    evidence_id: "supersede-follow-through-start",
    started_at: "2035-05-13T09:05:00Z",
    delivery_mode: "TRACK_ONLY",
    acknowledgement_due_at: "2035-05-13T10:00:00Z",
  },
});

const superseded = await supersedeSecretaryExecutiveDirective({
  context,
  payload: {
    directive_id: supersededDirectiveId,
    supersedes_version_id: supersededVersionId,
    replacement_instruction_text: "Send only the final approved draft to the owner.",
    issuer_party_id: ownerPartyId,
    target_party_id: targetPartyId,
    due_at: "2035-05-13T13:00:00Z",
    evidence_id: "directive-supersede-replacement-evidence",
    instructed_at: "2035-05-13T09:30:00Z",
  },
});
assert.equal(superseded.status, "superseded");
const staleRefreshed = await refreshSecretaryDirectiveFollowThrough({
  context,
  payload: {
    directive_id: supersededDirectiveId,
    refreshed_at: "2035-05-13T09:31:00Z",
  },
});
assert.equal(staleRefreshed.status, "stale_fenced");
assert.equal(staleRefreshed.run.state, "SUPERSEDED");
assert.equal(staleRefreshed.stale_version_fenced, true);
assert.equal(staleRefreshed.follow_ups.filter((row) => row.status === "PENDING").length, 0);

const listed = await listSecretaryDirectiveFollowThrough({ context, payload: { limit: 100 } });
assert.equal(listed.contract, "AVANTIQO_EXECUTIVE_SECRETARY_DIRECTIVE_FOLLOW_THROUGH_V1");
assert.ok(listed.returned_count >= 3);
assert.equal(listed.platform_permissions_mutated, false);

const readLow = await readSecretaryDirectiveFollowThrough({
  context,
  payload: { directive_id: lowDirectiveId },
});
assert.equal(readLow.run.state, "COMPLETED");
assert.equal(readLow.directive_ledger_task_is_execution_work, false);

const followThroughRows = await many(
  supabaseAdmin.from("secretary_follow_ups")
    .select("*")
    .eq("organization_id", organizationId)
    .limit(500),
);
assert.ok(followThroughRows.some((row) => row.metadata?.secretary_directive_follow_through === true));
assert.equal(followThroughRows.some((row) => row.metadata?.secretary_directive_follow_through === true && row.metadata?.payment_authority_created === true), false);

console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_EXPLICIT_TARGET_REQUIRED=true");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_DIRECT_DELIVERY_LOW_AUTHORITY=true");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_HIGH_AUTHORITY_AUTO_SEND=false");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_ACKNOWLEDGEMENT_EVIDENCE=true");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_ACKNOWLEDGEMENT_IS_ACCEPTANCE=false");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_ACKNOWLEDGEMENT_IS_COMMITMENT=false");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_ACKNOWLEDGEMENT_IS_COMPLETION=false");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_PROGRESS_EVIDENCE=true");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_PROGRESS_IS_COMPLETION=false");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_LINKED_EXECUTION_TERMINAL_IS_COMPLETION=false");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_COMPLETION_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_COMPLETION_REPLAY_SAFE=true");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_CANCEL_DOES_NOT_CANCEL_DIRECTIVE=true");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_CANCEL_REPLAY_SAFE=true");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_STALE_VERSION_FENCED=true");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_LEDGER_TASK_IS_EXECUTION_WORK=false");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_PAYMENT_AUTHORITY_CREATED=false");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_SIGNING_AUTHORITY_CREATED=false");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_BOOKING_AUTHORITY_CREATED=false");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_APPROVAL_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_BINDING_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
