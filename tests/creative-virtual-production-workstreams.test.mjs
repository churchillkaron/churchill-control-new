import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateVirtualProductionWorkstream,
  evaluateAllVirtualProductionWorkstreams,
} from "../lib/creative/production-room/runtime/CreativeVirtualProductionWorkstreamRuntime.js";

function passingEvidence(requirement) {
  const probe = evaluateVirtualProductionWorkstream({ requirement, evidence: {} });
  const evidence = Object.fromEntries(probe.required_outputs.map((key) => [key, `${requirement}:${key}:specific verified evidence`]));
  if (requirement === 1) evidence.source_manifest = [
    { source_id: "source-a", claim: "first independent fact" },
    { source_id: "source-b", claim: "second independent fact" },
  ];
  if (requirement === 19) evidence.cost_limit = 100;
  if (requirement === 20) evidence.governance_boundary = "ADVISORY ONLY; taste learning CANNOT change thresholds, routing, rights, cost authority or release governance.";
  return evidence;
}

test("all twenty workstreams reject missing evidence and pass their complete contract", () => {
  const allEvidence = {};
  for (let requirement = 1; requirement <= 20; requirement += 1) {
    const missing = evaluateVirtualProductionWorkstream({ requirement, evidence: {} });
    assert.equal(missing.passed, false, `requirement ${requirement} must fail empty evidence`);
    allEvidence[requirement] = passingEvidence(requirement);
  }
  const complete = evaluateAllVirtualProductionWorkstreams(allEvidence);
  assert.equal(complete.passed, true);
  assert.deepEqual(complete.failed_requirements, []);
});