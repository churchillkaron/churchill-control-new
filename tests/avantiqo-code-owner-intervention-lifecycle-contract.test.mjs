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

console.log("AVANTIQO_CODE_OWNER_INTERVENTION_LIFECYCLE_CONTRACT=PASS");
