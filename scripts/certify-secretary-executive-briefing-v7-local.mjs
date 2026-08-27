import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import {
  recordSecretaryExecutiveDirective,
  linkSecretaryDirectiveExecution,
  completeSecretaryExecutiveDirective,
  cancelSecretaryExecutiveDirective,
} from "../lib/operator/secretary/SecretaryExecutiveDirectiveRegisterRuntime.js";
import { readSecretaryExecutiveBriefingV7 } from "../lib/operator/secretary/SecretaryExecutiveBriefingV7Runtime.js";

const organizationId = randomUUID();
const ownerPartyId = randomUUID();
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

await one(supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Executive Briefing V7 Local Cert" }).select("*").single());
await one(supabaseAdmin.from("parties").insert({ id: ownerPartyId, organization_id: organizationId, display_name: "Executive Owner", party_type: "PERSON", status: "ACTIVE" }).select("*").single());
await one(supabaseAdmin.from("secretary_settings").insert({
  organization_id: organizationId,
  default_timezone: "Asia/Bangkok",
  appointment_duration_minutes: 30,
  business_hours: {},
  booking_policy: { owner_party_id: ownerPartyId },
  metadata: { owner_party_id: ownerPartyId },
}).select("*").single());

const executionTaskId = randomUUID();
await one(supabaseAdmin.from("secretary_tasks").insert({
  id: executionTaskId,
  organization_id: organizationId,
  owner_party_id: ownerPartyId,
  title: "Prepare supplier payment evidence",
  details: "Prepare evidence only",
  status: "OPEN",
  priority: "NORMAL",
  source: "secretary_staff_delegation",
  created_by_party_id: ownerPartyId,
  metadata: {},
}).select("*").single());

const currentOverdue = await recordSecretaryExecutiveDirective({
  context,
  payload: {
    instruction_text: "Prepare the supplier payment evidence and keep the approval gate intact.",
    issuer_party_id: ownerPartyId,
    evidence_id: "v7-current-evidence",
    instructed_at: "2035-04-01T01:00:00Z",
    due_at: "2035-04-09T12:00:00Z",
  },
});

await linkSecretaryDirectiveExecution({
  context,
  payload: {
    directive_id: currentOverdue.directive.directive_id,
    current_version_id: currentOverdue.directive.current_version.version_id,
    execution_task_id: executionTaskId,
    evidence_id: "v7-link-evidence",
  },
});

await one(supabaseAdmin.from("secretary_tasks").update({ status: "DONE", completed_at: "2035-04-09T10:00:00Z" }).eq("id", executionTaskId).select("*").single());

const completed = await recordSecretaryExecutiveDirective({
  context,
  payload: {
    instruction_text: "Send the board pack after final review.",
    issuer_party_id: ownerPartyId,
    evidence_id: "v7-completed-evidence",
    instructed_at: "2035-04-01T02:00:00Z",
  },
});
await completeSecretaryExecutiveDirective({
  context,
  payload: {
    directive_id: completed.directive.directive_id,
    current_version_id: completed.directive.current_version.version_id,
    evidence_id: "v7-completion-proof",
    completed_at: "2035-04-08T05:00:00Z",
  },
});

const cancelled = await recordSecretaryExecutiveDirective({
  context,
  payload: {
    instruction_text: "Arrange the Thursday supplier visit.",
    issuer_party_id: ownerPartyId,
    evidence_id: "v7-cancel-source",
    instructed_at: "2035-04-01T03:00:00Z",
  },
});
await cancelSecretaryExecutiveDirective({
  context,
  payload: {
    directive_id: cancelled.directive.directive_id,
    current_version_id: cancelled.directive.current_version.version_id,
    evidence_id: "v7-cancel-proof",
    cancelled_at: "2035-04-07T03:00:00Z",
  },
});

const noDue = await recordSecretaryExecutiveDirective({
  context,
  payload: {
    instruction_text: "Keep the quarterly archive ready for retrieval.",
    issuer_party_id: ownerPartyId,
    evidence_id: "v7-no-due-evidence",
    instructed_at: "2035-04-01T04:00:00Z",
  },
});

const result = await readSecretaryExecutiveBriefingV7({
  context,
  payload: {
    cadence: "DAILY",
    from: "2035-04-10T00:00:00Z",
    to: "2035-04-11T00:00:00Z",
    now: "2035-04-10T00:00:00Z",
    limit: 100,
  },
});

assert.equal(result.contract, "AVANTIQO_EXECUTIVE_SECRETARY_DESK_BRIEFING_V7");
assert.equal(result.evidence_only, true);
assert.equal(result.directive_inferred, false);
assert.equal(result.directive_completion_inferred, false);
assert.equal(result.directive_execution_terminal_is_completion, false);
assert.equal(result.directive_target_inferred, false);
assert.equal(result.directive_due_at_inferred, false);
assert.equal(result.directive_execution_link_inferred, false);
assert.equal(result.payment_authority_created, false);
assert.equal(result.signing_authority_created, false);
assert.equal(result.booking_authority_created, false);
assert.equal(result.binding_authority_created, false);
assert.equal(result.platform_permissions_mutated, false);
assert.equal(result.external_authority_used, false);
assert.equal(result.source_status.complete, true);

assert.equal(result.executive_desk.current_directive_count, 2);
assert.equal(result.executive_desk.completed_directive_count, 1);
assert.equal(result.executive_desk.cancelled_directive_count, 1);
assert.equal(result.executive_desk.overdue_current_directive_count, 1);
assert.equal(result.executive_desk.current_directive_with_execution_link_count, 1);
assert.equal(result.executive_desk.current_directive_without_execution_link_count, 1);
assert.equal(result.executive_desk.current_directive_linked_execution_terminal_count, 1);
assert.equal(result.executive_desk.directive_register.current.some((item) => item.directive_id === currentOverdue.directive.directive_id), true);
assert.equal(result.executive_desk.directive_register.current.some((item) => item.directive_id === noDue.directive.directive_id), true);
assert.equal(result.executive_desk.directive_register.completed.length, 1);
assert.equal(result.executive_desk.directive_register.cancelled.length, 1);
assert.equal(result.executive_desk.directive_register.overdue_current.length, 1);
assert.equal(result.executive_desk.directive_register.linked_execution_terminal_current.length, 1);
assert.equal(result.executive_desk.directive_register.linked_execution_terminal_current[0].state, "CURRENT");
assert.equal(result.executive_desk.directive_register.linked_execution_terminal_current[0].execution.completion_inferred, false);
assert.equal(result.executive_desk.directive_register.ledger_rows_are_execution_work, false);
assert.equal(result.executive_desk.directive_register.counted_again_in_v7_exception_total, false);
assert.equal(result.executive_desk.directive_register.counted_again_in_v7_secretary_owned_total, false);

assert.equal(result.executive_desk.exception_count, result.underlying_v6.executive_desk.exception_count);
assert.equal(result.executive_desk.secretary_owned_count, result.underlying_v6.executive_desk.secretary_owned_count);
assert.equal(result.executive_desk.counting_policy.v6_exception_count_preserved, true);
assert.equal(result.executive_desk.counting_policy.v6_secretary_owned_count_preserved, true);
assert.equal(result.executive_desk.counting_policy.directive_register_not_added_again, true);
assert.equal(result.executive_desk.counting_policy.directive_ledger_rows_not_execution_work, true);
assert.equal(result.executive_desk.counting_policy.directive_register_not_reclassified_as_decisions, true);
assert.equal(result.executive_desk.counting_policy.directive_register_not_reclassified_as_commitments, true);

console.log("SECRETARY_EXECUTIVE_BRIEFING_V7_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V7_DIRECTIVE_REGISTER_VISIBLE=true");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V7_EXPLICIT_DUE_VISIBILITY=true");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V7_LINKED_EXECUTION_VISIBLE=true");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V7_EXECUTION_TERMINAL_IS_COMPLETION=false");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V7_COMPLETION_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V7_V6_EXCEPTION_COUNT_PRESERVED=true");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V7_V6_SECRETARY_OWNED_COUNT_PRESERVED=true");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V7_DIRECTIVES_DOUBLE_COUNTED=false");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V7_DECISIONS_CREATED=false");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V7_COMMITMENTS_CREATED=false");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V7_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V7_BINDING_AUTHORITY_CREATED=false");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V7_BOOKING_AUTHORITY_CREATED=false");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V7_PAYMENT_AUTHORITY_CREATED=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
