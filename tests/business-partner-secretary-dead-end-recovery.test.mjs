import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const recovery = fs.readFileSync("lib/operator/secretary/SecretaryFollowUpRecoveryDirectiveRuntime.js", "utf8");
const execution = fs.readFileSync("lib/operator/secretary/SecretaryFollowUpExecutionRuntime.js", "utf8");
const escalation = fs.readFileSync("lib/operator/secretary/SecretaryFollowUpEscalationRuntime.js", "utf8");
const alerts = fs.readFileSync("lib/operator/secretary/SecretaryAlertRuntime.js", "utf8");

test("Secretary follow-up blockers map to Business Partner recovery instead of manual takeover", () => {
  assert.match(recovery, /recovery_owner:\s*"BUSINESS_PARTNER"/);
  assert.match(recovery, /manual_takeover_required:\s*false/);
  assert.match(recovery, /DATA_OR_CLARIFICATION/);
  assert.match(recovery, /CONFIGURATION_OR_EXTERNAL/);
  assert.match(recovery, /TRANSIENT_RUNTIME/);
  assert.match(recovery, /DIAGNOSIS_REQUIRED/);
  assert.doesNotMatch(escalation, /handle (?:the )?.* manually|retry manually|complete the follow-up manually/i);
});

test("only human-owned truth asks the human while configuration blockers stay with Business Partner", () => {
  assert.match(recovery, /ASK_ONLY_REQUIRED_HUMAN_TRUTH/);
  assert.match(recovery, /needs_human_truth:\s*true/);
  assert.match(recovery, /RESOLVE_CONFIGURATION_OR_EXTERNAL_DEPENDENCY/);
  assert.match(recovery, /resume_after_dependency_verified/);
  assert.doesNotMatch(recovery, /COMMUNICATION_CHANNEL_AVAILABLE|SECRETARY_PHONE_LINE_AVAILABLE/);
});

test("transport failures require current-state reinspection before retry", () => {
  assert.match(recovery, /OUTBOUND_CALL_FAILED/);
  assert.match(recovery, /OUTBOUND_CALL_CANCELLED/);
  assert.match(recovery, /SAFE_REINSPECT_THEN_RETRY/);
  assert.match(recovery, /safe_reinspect_then_retry/);
});

test("live follow-up execution persists the recovery directive on failed or skipped work", () => {
  assert.match(execution, /secretaryFollowUpRecoveryDirective/);
  assert.match(execution, /business_partner_recovery:\s*recoveryDirective/);
  assert.match(execution, /return \{ status: outcome\.status, execution: row, outcome, recovery: recoveryDirective/);
  assert.match(execution, /business_partner_recovery:\s*recovery/);
  assert.match(execution, /escalateSecretaryFollowUpExecution\(\{ execution: row, reason/);
  assert.match(execution, /escalateSecretaryFollowUpExecution\(\{ execution: updated, reason/);
});

test("Secretary attention tells Business Partner to continue the exact recovery path", () => {
  assert.match(alerts, /alert\.metadata\?\.business_partner_recovery/);
  assert.match(alerts, /Let Business Partner continue the exact follow-up through its registered recovery path/);
  assert.match(escalation, /recovery_owner:\s*"BUSINESS_PARTNER"/);
  assert.match(escalation, /manual_takeover_required:\s*false/);
  assert.match(escalation, /Secretary recovery pending/);
  assert.match(escalation, /Secretary needs one decision/);
  assert.match(escalation, /human_action_required:\s*recoveryDirective\.needs_human_truth === true/);
});
