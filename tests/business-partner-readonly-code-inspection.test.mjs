import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isAvantiqoReadOnlyCodeInspectionRequest, isAvantiqoSelfEngineeringRequest } from "../lib/operator/runtime/OperatorSelfEngineeringPolicy.js";

const request = {
  message: "ok can you check ui for finance and let me know if its finished and if not what you think we need to fix",
  pathname: "/workspace/local/finance",
};

test("Finance UI review routes to read-only Code inspection, never mutation", () => {
  assert.equal(isAvantiqoReadOnlyCodeInspectionRequest(request), true);
  assert.equal(isAvantiqoSelfEngineeringRequest(request), false);
});

test("read-only Code inspection bypasses cognitive planning and publishes concrete work", async () => {
  const synthetic = await readFile("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", "utf8");
  const inspector = await readFile("lib/code/runtime/CodeAIReadOnlyInspectionRuntime.js", "utf8");
  assert.ok(synthetic.indexOf("isAvantiqoReadOnlyCodeInspectionRequest(effectiveOptions)") < synthetic.indexOf("const cognitiveBriefStartedAt = Date.now()"));
  assert.match(inspector, /Reading \$\{filePath\}/);
  assert.match(inspector, /Running node --test \$\{testPath\}/);
  assert.match(inspector, /source_mutation_authority: false/);
  assert.match(inspector, /deploy_authority: false/);
});
test("verified Code commits upgrade the final handoff without inventing deployment", async () => {
  const operator = await readFile("lib/operator/runtime/OperatorTurnRuntime.js", "utf8");
  assert.match(operator, /function verifiedCodeCommitEvidence\(/);
  assert.match(operator, /VERIFIED_COMMITTED/);
  assert.match(operator, /\*\*Commit:\*\*/);
  assert.match(operator, /independently verified persistence on/);
  assert.match(operator, /Production deployment:\*\* not proven by this commit evidence/);
});
