import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const planRuntime = await readFile(
  "lib/code/runtime/CodeAIEngineeringPlanRuntime.js",
  "utf8",
);
const strategicRuntime = await readFile(
  "lib/code/runtime/CodeAIStrategicReasoningRuntime.js",
  "utf8",
);
const completionRuntime = await readFile(
  "lib/code/runtime/CodeProductCompletionCriteriaRuntime.js",
  "utf8",
);
const liveProgressRuntime = await readFile(
  "lib/code/runtime/CodeAILiveProgressRuntime.js",
  "utf8",
);
const planCard = await readFile(
  "components/operator/CodeEngineeringPlanCard.jsx",
  "utf8",
);
const liveCard = await readFile(
  "components/operator/CodeEngineeringIntelligenceLiveCard.jsx",
  "utf8",
);
const missionRoute = await readFile(
  "app/api/operator/code/mission/route.js",
  "utf8",
);
const businessPartnerSurface = await readFile(
  "components/operator/BusinessPartnerCodeMissionPanel.jsx",
  "utf8",
);
const studioPage = await readFile(
  "app/(system)/workspace/[organizationId]/creative/code/page.jsx",
  "utf8",
);

test("engineering plan is dynamic, repository reconciled and business-outcome first", () => {
  assert.match(planRuntime, /AVANTIQO_CODE_AI_ENGINEERING_PLAN_V1/);
  assert.match(planRuntime, /dynamic_reconciliation:\s*true/);
  assert.match(planRuntime, /static_plan:\s*false/);
  assert.match(planRuntime, /repository_evidence_authoritative:\s*true/);
  assert.match(planRuntime, /business_outcome_progress_primary:\s*true/);
  assert.match(planRuntime, /chain_of_thought_exposed:\s*false/);
  assert.match(planRuntime, /raw_reasoning_persisted:\s*false/);
});

test("plan phases cover engineering execution and explicit business acceptance", () => {
  for (const phase of [
    "REPOSITORY_UNDERSTANDING",
    "IMPLEMENTATION",
    "VERIFICATION",
    "BUSINESS_ACCEPTANCE",
    "FINAL_REVIEW",
    "BLOCKER_RESOLUTION",
  ]) {
    assert.match(planRuntime, new RegExp(phase));
  }
  assert.match(planRuntime, /projectCodeProductCompletionCriteria/);
  assert.match(planRuntime, /BOUND_PRODUCT_COMPLETION_CRITERIA/);
  assert.match(planRuntime, /business_outcome:\s*true/);
  assert.match(completionRuntime, /criteria_evidence/);
  assert.match(completionRuntime, /verified/);
});

test("observable mission changes revise the plan instead of freezing a checklist", () => {
  for (const reason of [
    "INITIAL_PLAN_CREATED",
    "REPOSITORY_HEAD_CHANGED",
    "FILE_SET_CHANGED",
    "VERIFICATION_EVIDENCE_CHANGED",
    "BUSINESS_ACCEPTANCE_EVIDENCE_CHANGED",
    "BLOCKERS_CHANGED",
    "FINAL_REVIEW_EVIDENCE_CHANGED",
    "OWNER_STEERING_CHANGED",
  ]) {
    assert.match(planRuntime, new RegExp(reason));
  }
  assert.match(planRuntime, /evidence_fingerprint/);
  assert.match(planRuntime, /engineering_plan_revision/);
});

test("owner steering changes plan direction without persisting steering text in the visible plan", () => {
  assert.match(planRuntime, /ownerInterventionFingerprint/);
  assert.match(planRuntime, /owner_steering_revises_plan:\s*true/);
  assert.match(planRuntime, /owner_steering_instruction_persisted_in_plan:\s*false/);
  assert.match(planRuntime, /OWNER_STEERING_CHANGED/);
});

test("strategic execution reconciles plan before and after each real package", () => {
  assert.match(strategicRuntime, /reconcileCodeAIEngineeringPlan/);
  assert.match(strategicRuntime, /bindCodeAIEngineeringPlanToState/);
  assert.match(strategicRuntime, /formatCodeAIEngineeringPlanForObjective/);
  assert.match(strategicRuntime, /plannedResumeState/);
  assert.match(strategicRuntime, /postPlan/);
  assert.match(strategicRuntime, /executeBatchedAutonomousCodeMissionWithDeterministicConvergence/);
  assert.match(strategicRuntime, /engineering_plan_business_outcome_progress_primary:\s*true/);
});

test("live progress and mission receipt expose the same inspectable engineering plan", () => {
  assert.match(liveProgressRuntime, /engineering_plan:\s*compactEngineeringPlan/);
  assert.match(liveProgressRuntime, /engineering_plan_visible:\s*true/);
  assert.match(liveProgressRuntime, /business_outcome_progress_primary:\s*true/);
  assert.match(missionRoute, /engineering_plan:/);
  assert.match(liveCard, /CodeEngineeringPlanCard/);
  assert.match(planCard, /data-avantiqo-code-engineering-plan="true"/);
  assert.match(planCard, /Current priority/);
  assert.match(planCard, /Why the plan changed/);
  assert.match(planCard, /data-avantiqo-code-business-acceptance="true"/);
  assert.match(planCard, /Business acceptance/);
});

test("Business Partner and Code Studio share the same plan feed", () => {
  assert.match(businessPartnerSurface, /CodeEngineeringIntelligenceLiveCard/);
  assert.match(studioPage, /CodeEngineeringIntelligenceLiveCard/);
  assert.match(liveCard, /\/api\/operator\/code\/progress/);
});

test("engineering plan never becomes execution, commit, deploy or governance authority", () => {
  assert.match(planRuntime, /plan_is_execution_authority:\s*false/);
  assert.match(planRuntime, /plan_is_commit_authority:\s*false/);
  assert.match(planRuntime, /plan_is_deploy_authority:\s*false/);
  assert.match(planRuntime, /authorization_effect:\s*"NONE"/);
  assert.match(planCard, /grants no commit, deploy, migration, publication, or governance authority/i);
});
