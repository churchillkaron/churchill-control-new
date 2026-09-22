import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Code owner steering uses a truthful leased lifecycle and only applies after fresh reasoning", () => {
  const owner = read("lib/code/runtime/CodeAIOwnerInterventionRuntime.js");
  const workPackage = read("lib/code/runtime/CodeAIWorkPackageRuntime.js");
  const convergence = read(
    "lib/code/runtime/CodeAIWorkPackageDeterministicConvergenceRuntime.js",
  );

  assert.match(owner, /AVANTIQO_CODE_AI_OWNER_INTERVENTION_LIFECYCLE_V2/);
  assert.match(owner, /status: "PENDING"/);
  assert.match(owner, /status: "CLAIMED"/);
  assert.match(owner, /status: "APPLIED"/);
  assert.match(owner, /claim_id/);
  assert.match(owner, /claim_expires_at/);
  assert.match(owner, /recoverExpiredClaims/);
  assert.match(owner, /compareAndSetActiveRow/);
  assert.match(owner, /\.eq\("updated_at", row\.updated_at\)/);
  assert.match(owner, /blocked_by_existing_claim/);
  assert.match(owner, /applyClaimedCodeAIOwnerIntervention/);
  assert.match(owner, /releaseClaimedCodeAIOwnerIntervention/);
  assert.match(owner, /CODE_AI_OWNER_INTERVENTION_FRESH_REASONING_PACKAGE_REQUIRED/);
  assert.match(owner, /batched_reasoning_package/);
  assert.match(owner, /applied_reasoning_package_at/);
  assert.match(owner, /applied_reasoning_call/);

  assert.match(workPackage, /stateWithClaimedOwnerIntervention/);
  assert.match(workPackage, /fresh_reasoning_required: true/);
  assert.match(workPackage, /latestFreshReasoningPackage/);
  assert.match(workPackage, /kind, 120\) !== "batched_reasoning_package"/);
  assert.match(workPackage, /applyClaimedCodeAIOwnerIntervention/);
  assert.match(workPackage, /releaseClaimedCodeAIOwnerIntervention/);
  assert.match(workPackage, /CODE_AI_OWNER_INTERVENTION_APPLY_RECONCILIATION_REQUIRED/);
  assert.match(workPackage, /CODE_AI_OWNER_INTERVENTION_RELEASE_RECONCILIATION_REQUIRED/);
  assert.doesNotMatch(workPackage, /status: "applied_at_safe_boundary"/);

  assert.match(convergence, /freshOwnerSteeringReasoningRequired/);
  assert.match(convergence, /ownerSteeringRequiresFreshReasoning/);
  assert.match(convergence, /!ownerSteeringRequiresFreshReasoning/);
  assert.match(
    convergence,
    /owner_steering_fresh_reasoning_bypasses_deterministic_short_circuit: true/,
  );
});

test("Owner STOP is a bounded execution-reduction action that settles without fresh reasoning", () => {
  const owner = read("lib/code/runtime/CodeAIOwnerInterventionRuntime.js");
  const workPackage = read("lib/code/runtime/CodeAIWorkPackageRuntime.js");
  const route = read("app/api/operator/code/intervention/route.js");
  const liveWorkPackage = read("lib/code/runtime/CodeAIWorkPackageRuntimeLive.js");
  const missionRuntime = read("lib/code/runtime/CodeAIMissionRuntime.js");
  const convergence = read("lib/code/runtime/CodeAIWorkPackageDeterministicConvergenceRuntime.js");

  assert.match(owner, /INTERVENTION_ACTIONS = new Set\(\["STEER", "REQUEST_CHANGES", "STOP"\]\)/);
  assert.match(owner, /applyClaimedCodeAIOwnerStop/);
  assert.match(owner, /stop_requires_fresh_reasoning: false/);
  assert.match(owner, /authorization_effect: "REDUCE_EXECUTION_ONLY"/);
  assert.match(workPackage, /stateWithAppliedOwnerStop/);
  assert.match(workPackage, /CODE_AI_OWNER_STOP_REQUESTED/);
  assert.match(workPackage, /publishCodeAILiveProgress/);
  assert.match(workPackage, /phase: "OWNER_STOPPED"/);
  assert.match(workPackage, /status: "stopped"/);
  assert.match(workPackage, /mission_already_stopped: true/);
  assert.match(workPackage, /source_mutation_performed: false/);
  assert.match(workPackage, /commit_performed: false/);
  assert.match(workPackage, /production_deploy_performed: false/);
  assert.match(route, /\["STEER", "STOP"\]\.includes\(action\)/);
  assert.match(owner, /consumePendingCodeAIOwnerStopAtSafeBoundary/);
  assert.match(owner, /applied_at_safe_boundary: true/);
  assert.match(liveWorkPackage, /consumeOwnerStopBoundary/);
  assert.match(liveWorkPackage, /const initialOwnerStop = await consumeOwnerStopBoundary/);
  assert.match(liveWorkPackage, /const postPlanningOwnerStop = await consumeOwnerStopBoundary/);
  assert.match(liveWorkPackage, /const operationOwnerStop = await consumeOwnerStopBoundary/);
  assert.match(liveWorkPackage, /owner_stop_applied_at_internal_safe_boundary/);
  assert.match(liveWorkPackage, /phase: "OWNER_STOPPED"/);
  assert.match(missionRuntime, /control_context = null/);
  assert.match(missionRuntime, /consumeMissionOwnerStopAtBoundary/);
  assert.match(missionRuntime, /owner_stop_applied_before_repository_operation/);
  assert.match(missionRuntime, /phase: "OWNER_STOPPED"/);
  assert.match(liveWorkPackage, /control_context: context/);
  assert.match(convergence, /control_context: context/);
  assert.match(convergence, /OWNER_STOPPED_AT_SAFE_BOUNDARY/);
});

console.log("AVANTIQO_CODE_OWNER_INTERVENTION_LIFECYCLE_CONTRACT=PASS");
