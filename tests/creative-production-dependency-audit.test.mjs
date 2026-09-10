import test from "node:test";
import assert from "node:assert/strict";

import { auditProductionWorkstreamDependencies } from "../lib/creative/production-room/runtime/CreativeProductionDependencyAuditRuntime.js";
import { dependenciesForProductionWorkstream } from "../lib/creative/production-room/runtime/CreativeProductionWorkOrderRuntime.js";

test("all fifteen production rooms have a deadlock-free specialist dependency schedule", () => {
  const result = auditProductionWorkstreamDependencies();
  assert.equal(result.passed, true, result.failures.join(","));
  assert.equal(result.stages.length, 15);
  assert.equal(result.stages.every((stage) => stage.passed), true);
  assert.equal(result.stages.every((stage) => stage.unresolved_requirements.length === 0), true);
  assert.equal(result.zero_media_generation, true);
});

test("early creative dependencies are stage-specific rather than waiting on later rooms", () => {
  assert.deepEqual(dependenciesForProductionWorkstream("CREATIVE_FLOOR", 16), [1]);
  assert.deepEqual(dependenciesForProductionWorkstream("CREATIVE_FLOOR", 20), [1]);
  assert.deepEqual(dependenciesForProductionWorkstream("TECHNICAL_SCOUT", 5), [1, 3]);
  assert.deepEqual(dependenciesForProductionWorkstream("PREVIS", 19), [7, 12]);
});
