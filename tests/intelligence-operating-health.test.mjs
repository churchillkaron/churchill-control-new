import test from "node:test";
import assert from "node:assert/strict";
import { assessIntelligenceOperatingHealth, summarizeIntelligenceUsage } from "../lib/operator/runtime/IntelligenceUsageEconomicsPolicy.js";

test("economics reconstructs context tokens from legacy reasoning telemetry", () => {
  const summary = summarizeIntelligenceUsage([{
    module: "INTELLIGENCE",
    supplier_cost: 1.2,
    customer_price: 2,
    metadata: {
      intelligence_execution_lane: "fast",
      intelligence_context_budget: { message_chars: 12000 },
      intelligence_tool_descriptor_budget: { descriptor_chars: 24000 },
    },
  }]);
  assert.equal(summary.calls, 1);
  assert.equal(summary.fast_calls, 1);
  assert.equal(summary.estimated_context_tokens, 9000);
  assert.equal(summary.average_context_tokens, 9000);
});

test("explicit bounded context estimate remains authoritative when present", () => {
  const summary = summarizeIntelligenceUsage([{
    module: "INTELLIGENCE",
    metadata: {
      intelligence_context_budget: { estimated_input_tokens: 3100, message_chars: 12000 },
      intelligence_tool_descriptor_budget: { descriptor_chars: 24000 },
    },
  }]);
  assert.equal(summary.estimated_context_tokens, 3100);
});
test("operating health flags context and cost growth without changing authority", () => {
  const result = assessIntelligenceOperatingHealth(
    { calls: 100, deep_calls: 30, average_context_tokens: 5000, supplier_cost: 40 },
    { calls: 100, deep_calls: 10, average_context_tokens: 3500, supplier_cost: 20 },
    { memory: { operator_active_total: 100, temperature: { COLD: 70 } } },
  );
  assert.equal(result.status, "REVIEW");
  assert.ok(result.signals.includes("CONTEXT_GROWTH_HIGH"));
  assert.ok(result.signals.includes("COST_PER_CALL_GROWTH_HIGH"));
  assert.ok(result.signals.includes("DEEP_SHARE_RISING"));
  assert.ok(result.signals.includes("COLD_MEMORY_HIGH"));
  assert.equal(result.governance.commercial_quota_assessed, false);
  assert.equal(result.governance.authority_changed, false);
});

test("stable bounded usage remains healthy", () => {
  const result = assessIntelligenceOperatingHealth(
    { calls: 80, deep_calls: 8, average_context_tokens: 3200, supplier_cost: 16 },
    { calls: 75, deep_calls: 8, average_context_tokens: 3100, supplier_cost: 15 },
    { memory: { operator_active_total: 100, temperature: { COLD: 20 } } },
  );
  assert.equal(result.status, "HEALTHY");
  assert.deepEqual(result.signals, []);
});