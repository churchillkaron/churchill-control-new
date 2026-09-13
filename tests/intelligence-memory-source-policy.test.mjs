import assert from "node:assert/strict";
import test from "node:test";
import {
  CANONICAL_EXPLICIT_MEMORY_SOURCE,
  LEGACY_EXPLICIT_MEMORY_SOURCES,
  OPERATOR_CONSOLIDATION_SOURCES,
  OPERATOR_OBSERVABILITY_SOURCES,
} from "../lib/operator/runtime/IntelligenceMemoryGovernorPolicy.js";

test("explicit memory uses one canonical source while legacy rows remain governed", () => {
  assert.equal(CANONICAL_EXPLICIT_MEMORY_SOURCE, "explicit_user_statement");
  assert.ok(LEGACY_EXPLICIT_MEMORY_SOURCES.includes("persisted_user_turn"));
  assert.ok(OPERATOR_CONSOLIDATION_SOURCES.includes(CANONICAL_EXPLICIT_MEMORY_SOURCE));
  assert.ok(OPERATOR_CONSOLIDATION_SOURCES.includes("persisted_user_turn"));
  assert.ok(OPERATOR_OBSERVABILITY_SOURCES.includes("persisted_user_turn"));
  assert.ok(OPERATOR_OBSERVABILITY_SOURCES.includes("adaptive_execution_learning"));
});
