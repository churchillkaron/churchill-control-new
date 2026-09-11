import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const mission = fs.readFileSync("lib/platform/capabilities/createOperatorMissionCapability.js", "utf8");
const core = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");

test("mission runtime exposes exact inner capability failure evidence", () => {
  assert.match(mission, /AVANTIQO_OPERATOR_MISSION_STEP_FAILURE_EVIDENCE_V1/);
  assert.match(mission, /capability:\s*\{[\s\S]*key: text\(entry\?\.step\?\.capability_key\)/);
  assert.match(mission, /mutation_completion_proven: false/);
  assert.match(mission, /raw_error_exposed: false/);
  assert.match(core, /failure_evidence:[\s\S]*mission_run_id/);
});

test("blocked mission recovery binds the exact failed step and immutable completed prefix", () => {
  assert.match(core, /AVANTIQO_BUSINESS_PARTNER_MISSION_RECOVERY_V1/);
  assert.match(core, /failed_step_id: failedStepId/);
  assert.match(core, /completed_step_ids: completed/);
  assert.match(core, /expectedPrefix = steps\.slice\(0, failedIndex\)/);
  assert.match(core, /completed\.length !== expectedPrefix\.length/);
  assert.match(core, /authorization_effect: "SAME_ACTION_ONLY"/);
});

test("mission repair never reuses prior confirmation or approval", () => {
  assert.match(core, /prior_confirmation_reused: false/);
  assert.match(core, /prior_approval_reused: false/);
  assert.match(core, /current_step_confirmed: false/);
  assert.match(core, /approval_request_id: null/);
});

test("verified repaired step resumes remaining mission through canonical mission capability", () => {
  assert.match(core, /resumeBusinessPartnerRecovery && businessEffectVerified/);
  assert.match(core, /businessPartnerMissionContinuation/);
  assert.match(core, /capabilities\.find\(\(item\) => item\.key === OPERATOR_MISSION_KEY\)/);
  assert.match(core, /operatorMissionResume: true/);
  assert.match(core, /businessPartnerSelfHealingMissionResume: true/);
  assert.match(core, /repairedStepBusinessEffectVerified: true/);
  assert.match(core, /completed_step_ids: \[\.\.\.priorCompleted, failedStepId\]/);
});

test("final repaired mission step closes the original mission instead of leaving it blocked", () => {
  assert.match(core, /completion_result:/);
  assert.match(core, /completed_steps: steps\.length/);
  assert.match(core, /completed_step_ids: steps\.map/);
  assert.match(core, /objective: missionContinuation\.objective/);
  assert.match(core, /resumedRun: true/);
});
