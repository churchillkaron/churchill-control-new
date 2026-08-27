import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import {
  cancelSecretaryExecutiveDirective,
  completeSecretaryExecutiveDirective,
  linkSecretaryDirectiveExecution,
  listSecretaryExecutiveDirectives,
  readSecretaryExecutiveDirective,
  recordSecretaryExecutiveDirective,
  supersedeSecretaryExecutiveDirective,
} from "../lib/operator/secretary/SecretaryExecutiveDirectiveRegisterRuntime.js";

const organizationId = randomUUID();
const ownerPartyId = randomUUID();
const targetPartyId = randomUUID();
const executionTaskId = randomUUID();
const executionJobId = randomUUID();
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

await one(supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Directive Register Local Cert" }).select("*").single(), "organization");
for (const party of [
  { id: ownerPartyId, display_name: "Executive Owner" },
  { id: targetPartyId, display_name: "Finance Manager" },
]) {
  await one(supabaseAdmin.from("parties").insert({
    id: party.id,
    organization_id: organizationId,
    display_name: party.display_name,
    party_type: "PERSON",
    status: "ACTIVE",
  }).select("*").single(), `party:${party.display_name}`);
}
await one(supabaseAdmin.from("secretary_settings").insert({
  organization_id: organizationId,
  default_timezone: "Asia/Bangkok",
  booking_policy: { owner_party_id: ownerPartyId },
  metadata: { owner_party_id: ownerPartyId },
}).select("*").single(), "settings");
await one(supabaseAdmin.from("secretary_tasks").insert({
  id: executionTaskId,
  organization_id: organizationId,
  owner_party_id: ownerPartyId,
  contact_party_id: targetPartyId,
  title: "Prepare approved invoice payment",
  details: "Existing execution task. Payment still requires the existing exact-step approval gate.",
  status: "OPEN",
  priority: "NORMAL",
  source: "secretary_staff_delegation",
  created_by_party_id: ownerPartyId,
  metadata: { certification_execution_fixture: true },
}).select("*").single(), "execution-task");
await one(supabaseAdmin.from("secretary_jobs").insert({
  id: executionJobId,
  organization_id: organizationId,
  requested_by_party_id: ownerPartyId,
  source_kind: "MANUAL",
  objective: "Track the existing invoice preparation work through the normal approval boundary.",
  success_criteria: ["Preparation tracked without bypassing approval"],
  status: "ACTIVE",
  autonomy_level: "EXECUTE_WITH_GATES",
  approval_policy: { payment_requires_approval: true },
  execution_plan: [],
  metadata: { certification_execution_fixture: true },
}).select("*").single(), "execution-job");

await expectError(() => recordSecretaryExecutiveDirective({
  context,
  payload: {
    instruction_text: "Prepare the invoice for payment.",
    issuer_party_id: ownerPartyId,
    instructed_at: "2035-08-01T08:00:00Z",
  },
}), "SECRETARY_DIRECTIVE_REGISTER_EVIDENCE_REQUIRED");
await expectError(() => recordSecretaryExecutiveDirective({
  context,
  payload: {
    instruction_text: "Prepare the invoice for payment.",
    evidence_id: "directive-missing-issuer-evidence",
    instructed_at: "2035-08-01T08:00:00Z",
  },
}), "SECRETARY_DIRECTIVE_REGISTER_ISSUER_PARTY_REQUIRED");

const exactInstruction = "  Pay this invoice only after the existing approval gate clears.\nKeep the approval evidence with the payment record.  ";
const directPayload = {
  instruction_text: exactInstruction,
  issuer_party_id: ownerPartyId,
  evidence_id: "directive-payment-preparation-v1",
  instructed_at: "2035-08-01T08:00:00Z",
  source_reference: "executive-message:payment-preparation-v1",
};
const direct = await recordSecretaryExecutiveDirective({ context, payload: directPayload });
assert.equal(direct.status, "recorded");
assert.equal(direct.replay_safe, false);
assert.equal(direct.instruction_text_preserved_exactly, true);
assert.equal(direct.directive.state, "CURRENT");
assert.equal(direct.directive.current_version.instruction_text, exactInstruction);
assert.equal(direct.directive.current_version.issuer_party_id, ownerPartyId);
assert.equal(direct.directive.current_version.target_party_id, null);
assert.equal(direct.directive.current_version.target_text, null);
assert.equal(direct.directive.current_version.due_at, null);
assert.equal(direct.directive.current_version.execution_task_id, null);
assert.equal(direct.directive.current_version.execution_job_id, null);
assert.equal(direct.directive.ledger_task_is_execution_work, false);
assert.equal(direct.payment_authority_created, false);
assert.equal(direct.signing_authority_created, false);
assert.equal(direct.booking_authority_created, false);
assert.equal(direct.approval_authority_delegated, false);
assert.equal(direct.binding_authority_delegated, false);

const directReplay = await recordSecretaryExecutiveDirective({ context, payload: directPayload });
assert.equal(directReplay.replay_safe, true);
assert.equal(directReplay.directive.directive_id, direct.directive.directive_id);
assert.equal(directReplay.directive.current_version.instruction_text, exactInstruction);

const storedLedgerRow = await one(supabaseAdmin.from("secretary_tasks")
  .select("id,status,due_at,remind_at,details,source,metadata")
  .eq("organization_id", organizationId)
  .eq("id", direct.directive.directive_id)
  .single(), "stored-ledger-row");
assert.equal(storedLedgerRow.status, "DONE");
assert.equal(storedLedgerRow.due_at, null);
assert.equal(storedLedgerRow.remind_at, null);
assert.equal(storedLedgerRow.details, exactInstruction);
assert.equal(storedLedgerRow.source, "secretary_directive_register");
assert.equal(storedLedgerRow.metadata.ledger_task_is_execution_work, false);
assert.equal(storedLedgerRow.metadata.payment_authority_created, false);
assert.equal(storedLedgerRow.metadata.approval_authority_delegated, false);

const directVersionId = direct.directive.current_version.version_id;
const linked = await linkSecretaryDirectiveExecution({
  context,
  payload: {
    directive_id: direct.directive.directive_id,
    current_version_id: directVersionId,
    evidence_id: "directive-execution-link-v1",
    execution_task_id: executionTaskId,
    execution_job_id: executionJobId,
  },
});
assert.equal(linked.status, "linked");
assert.equal(linked.replay_safe, false);
assert.equal(linked.directive.current_version.execution_task_id, executionTaskId);
assert.equal(linked.directive.current_version.execution_job_id, executionJobId);
assert.equal(linked.execution_link_inferred, false);
assert.equal(linked.completion_inferred, false);
const linkedReplay = await linkSecretaryDirectiveExecution({
  context,
  payload: {
    directive_id: direct.directive.directive_id,
    current_version_id: directVersionId,
    evidence_id: "directive-execution-link-v1",
    execution_task_id: executionTaskId,
    execution_job_id: executionJobId,
  },
});
assert.equal(linkedReplay.replay_safe, true);

await one(supabaseAdmin.from("secretary_tasks")
  .update({ status: "DONE", completed_at: "2035-08-01T10:00:00Z" })
  .eq("organization_id", organizationId)
  .eq("id", executionTaskId)
  .select("*").single(), "complete-execution-task-fixture");
await one(supabaseAdmin.from("secretary_jobs")
  .update({ status: "COMPLETED", completed_at: "2035-08-01T10:00:00Z", result_summary: "Preparation work completed." })
  .eq("organization_id", organizationId)
  .eq("id", executionJobId)
  .select("*").single(), "complete-execution-job-fixture");

const beforeExplicitCompletion = await readSecretaryExecutiveDirective({ context, payload: { directive_id: direct.directive.directive_id } });
assert.equal(beforeExplicitCompletion.directive.state, "CURRENT");
assert.equal(beforeExplicitCompletion.directive.execution.task.status, "DONE");
assert.equal(beforeExplicitCompletion.directive.execution.job.status, "COMPLETED");
assert.equal(beforeExplicitCompletion.directive.execution.completion_inferred, false);
assert.equal(beforeExplicitCompletion.completion_inferred, false);

const completePayload = {
  directive_id: direct.directive.directive_id,
  current_version_id: directVersionId,
  evidence_id: "directive-explicit-completion-v1",
  completed_at: "2035-08-01T10:05:00Z",
  source_reference: "executive-confirmation:payment-preparation-complete-v1",
  result: "Executive explicitly confirmed the instruction completed.",
};
const completed = await completeSecretaryExecutiveDirective({ context, payload: completePayload });
assert.equal(completed.status, "completed");
assert.equal(completed.replay_safe, false);
assert.equal(completed.directive.state, "COMPLETED");
assert.equal(completed.directive.current_version, null);
assert.equal(completed.directive.latest_version.state, "COMPLETED");
assert.equal(completed.completion_evidence_required, true);
assert.equal(completed.completion_inferred, false);
assert.equal(completed.payment_authority_created, false);
const completedReplay = await completeSecretaryExecutiveDirective({ context, payload: completePayload });
assert.equal(completedReplay.replay_safe, true);

const second = await recordSecretaryExecutiveDirective({
  context,
  payload: {
    instruction_text: "Send the board pack to the named directors by Friday.",
    issuer_party_id: ownerPartyId,
    evidence_id: "directive-board-pack-v1",
    instructed_at: "2035-08-02T08:00:00Z",
    target_party_id: targetPartyId,
    due_at: "2035-08-03T10:00:00Z",
    source_reference: "executive-message:board-pack-v1",
  },
});
assert.equal(second.directive.current_version.target_party_id, targetPartyId);
assert.equal(second.directive.current_version.due_at, "2035-08-03T10:00:00.000Z");
const secondV1 = second.directive.current_version.version_id;
const supersedePayload = {
  directive_id: second.directive.directive_id,
  supersedes_version_id: secondV1,
  replacement_instruction_text: "Send the revised board pack to the directors after legal review.",
  issuer_party_id: ownerPartyId,
  evidence_id: "directive-board-pack-v2",
  instructed_at: "2035-08-02T09:00:00Z",
  source_reference: "executive-message:board-pack-v2",
};
const superseded = await supersedeSecretaryExecutiveDirective({ context, payload: supersedePayload });
assert.equal(superseded.status, "superseded");
assert.equal(superseded.replay_safe, false);
assert.equal(superseded.directive.versions.length, 2);
assert.equal(superseded.directive.versions.find((row) => row.version_id === secondV1)?.state, "SUPERSEDED");
assert.equal(superseded.directive.current_version.instruction_text, supersedePayload.replacement_instruction_text);
assert.equal(superseded.directive.current_version.target_party_id, null);
assert.equal(superseded.directive.current_version.target_text, null);
assert.equal(superseded.directive.current_version.due_at, null);
assert.equal(superseded.directive.current_version.execution_task_id, null);
assert.equal(superseded.directive.current_version.execution_job_id, null);
assert.equal(superseded.directive.current_version.target_inferred, false);
assert.equal(superseded.directive.current_version.due_at_inferred, false);
const secondV2 = superseded.directive.current_version.version_id;
const supersedeReplay = await supersedeSecretaryExecutiveDirective({ context, payload: supersedePayload });
assert.equal(supersedeReplay.replay_safe, true);
assert.equal(supersedeReplay.directive.current_version.version_id, secondV2);
await expectError(() => supersedeSecretaryExecutiveDirective({
  context,
  payload: {
    ...supersedePayload,
    replacement_instruction_text: "Send another version immediately.",
    evidence_id: "directive-board-pack-stale-v3",
    instructed_at: "2035-08-02T09:30:00Z",
  },
}), "SECRETARY_DIRECTIVE_REGISTER_STALE_SUPERSESSION_REJECTED");

const cancelPayload = {
  directive_id: second.directive.directive_id,
  current_version_id: secondV2,
  evidence_id: "directive-board-pack-cancel-v1",
  cancelled_at: "2035-08-02T10:00:00Z",
  source_reference: "executive-message:board-pack-cancel-v1",
  reason: "Executive explicitly withdrew the board-pack instruction.",
};
const cancelled = await cancelSecretaryExecutiveDirective({ context, payload: cancelPayload });
assert.equal(cancelled.status, "cancelled");
assert.equal(cancelled.replay_safe, false);
assert.equal(cancelled.directive.state, "CANCELLED");
assert.equal(cancelled.directive.current_version, null);
assert.equal(cancelled.directive.latest_version.state, "CANCELLED");
assert.equal(cancelled.replacement_directive_inferred, false);
const cancelledReplay = await cancelSecretaryExecutiveDirective({ context, payload: cancelPayload });
assert.equal(cancelledReplay.replay_safe, true);
await expectError(() => cancelSecretaryExecutiveDirective({
  context,
  payload: {
    directive_id: second.directive.directive_id,
    current_version_id: secondV1,
    evidence_id: "directive-board-pack-stale-cancel",
    cancelled_at: "2035-08-02T10:30:00Z",
  },
}), "SECRETARY_DIRECTIVE_REGISTER_STALE_CANCELLATION_REJECTED");

const third = await recordSecretaryExecutiveDirective({
  context,
  payload: {
    instruction_text: "Ask the operations team for a factual inventory variance report.",
    issuer_party_id: ownerPartyId,
    evidence_id: "directive-inventory-report-v1",
    instructed_at: "2035-08-03T08:00:00Z",
    target_text: "Operations team",
  },
});
assert.equal(third.directive.state, "CURRENT");
assert.equal(third.directive.current_version.target_party_id, null);
assert.equal(third.directive.current_version.target_text, "Operations team");
assert.equal(third.directive.current_version.due_at, null);

const register = await listSecretaryExecutiveDirectives({ context, payload: { limit: 50 } });
assert.equal(register.status, "completed");
assert.equal(register.summary.returned_lineages, 3);
assert.equal(register.summary.current_lineages, 1);
assert.equal(register.summary.completed_lineages, 1);
assert.equal(register.summary.cancelled_lineages, 1);
assert.equal(register.summary.version_count, 4);
assert.equal(register.ledger_rows_are_execution_work, false);
assert.equal(register.directive_inferred, false);
assert.equal(register.directive_issued_by_secretary, false);
assert.equal(register.payment_authority_created, false);
assert.equal(register.signing_authority_created, false);
assert.equal(register.booking_authority_created, false);
assert.equal(register.approval_authority_delegated, false);
assert.equal(register.binding_authority_delegated, false);
assert.equal(register.platform_permissions_mutated, false);
assert.equal(register.external_authority_used, false);

const decisionRows = await one(supabaseAdmin.from("secretary_tasks")
  .select("id")
  .eq("organization_id", organizationId)
  .eq("source", "secretary_decision_register"), "decision-rows");
assert.ok(Array.isArray(decisionRows));
assert.equal(decisionRows.length, 0);

console.log("SECRETARY_DIRECTIVE_REGISTER_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_DIRECTIVE_REGISTER_EXACT_INSTRUCTION_TEXT=true");
console.log("SECRETARY_DIRECTIVE_REGISTER_DIRECT_REPLAY_SAFE=true");
console.log("SECRETARY_DIRECTIVE_REGISTER_ISSUER_REQUIRED=true");
console.log("SECRETARY_DIRECTIVE_REGISTER_TARGET_INFERRED=false");
console.log("SECRETARY_DIRECTIVE_REGISTER_DUE_AT_INFERRED=false");
console.log("SECRETARY_DIRECTIVE_REGISTER_LEDGER_TASK_IS_EXECUTION_WORK=false");
console.log("SECRETARY_DIRECTIVE_REGISTER_EXECUTION_LINK_EXPLICIT=true");
console.log("SECRETARY_DIRECTIVE_REGISTER_EXECUTION_STATUS_DOES_NOT_COMPLETE_DIRECTIVE=true");
console.log("SECRETARY_DIRECTIVE_REGISTER_COMPLETION_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_DIRECTIVE_REGISTER_SUPERSESSION_REPLAY_SAFE=true");
console.log("SECRETARY_DIRECTIVE_REGISTER_STALE_SUPERSESSION_FENCED=true");
console.log("SECRETARY_DIRECTIVE_REGISTER_UNSTATED_FIELDS_CARRIED_FORWARD=false");
console.log("SECRETARY_DIRECTIVE_REGISTER_CANCELLATION_REPLAY_SAFE=true");
console.log("SECRETARY_DIRECTIVE_REGISTER_STALE_CANCELLATION_FENCED=true");
console.log("SECRETARY_DIRECTIVE_REGISTER_DECISION_ROWS_CREATED=false");
console.log("SECRETARY_DIRECTIVE_REGISTER_PAYMENT_AUTHORITY_CREATED=false");
console.log("SECRETARY_DIRECTIVE_REGISTER_SIGNING_AUTHORITY_CREATED=false");
console.log("SECRETARY_DIRECTIVE_REGISTER_BOOKING_AUTHORITY_CREATED=false");
console.log("SECRETARY_DIRECTIVE_REGISTER_APPROVAL_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_DIRECTIVE_REGISTER_BINDING_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_DIRECTIVE_REGISTER_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
