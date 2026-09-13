import assert from "node:assert/strict";
import test from "node:test";
import { operatorMemoryConsolidationDisposition } from "../lib/operator/runtime/IntelligenceMemoryTemperaturePolicy.js";
const now = Date.parse("2026-09-13T00:00:00Z");
test("durable operator decisions are never archived", () => {
  const value = operatorMemoryConsolidationDisposition({ memory_type:"decision", importance:.95, source:"operator_project_state", metadata:{durability:"durable"}, updated_at:"2025-01-01T00:00:00Z" }, now);
  assert.equal(value.disposition, "KEEP");
});
test("cold low-value transient operator memory becomes archive candidate", () => {
  const value = operatorMemoryConsolidationDisposition({ memory_type:"completed_step", importance:.4, recall_count:0, source:"operator_project_state", metadata:{durability:"transient"}, updated_at:"2025-01-01T00:00:00Z" }, now);
  assert.equal(value.disposition, "ARCHIVE");
});
test("governance and learning memory sources are protected", () => {
  const value = operatorMemoryConsolidationDisposition({ memory_type:"fact", importance:.1, source:"learning_policy", metadata:{}, updated_at:"2024-01-01T00:00:00Z" }, now);
  assert.equal(value.disposition, "KEEP");
});
