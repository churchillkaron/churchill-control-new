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
test("economics measures stable context reuse without raw content", () => {
  const rows = ["same", "same", "other"].map((fingerprint) => ({
    module: "INTELLIGENCE",
    metadata: {
      intelligence_operator_context_fingerprint: {
        static_context_fingerprint: fingerprint,
        raw_content_returned: false,
      },
    },
  }));
  const summary = summarizeIntelligenceUsage(rows);
  assert.equal(summary.fingerprinted_calls, 3);
  assert.equal(summary.repeated_static_context_calls, 1);
  assert.equal(summary.stable_context_reuse_ratio, 0.3333);
});

test("economics measures observed prefix-cache savings", () => {
  const summary = summarizeIntelligenceUsage([
    { module: "INTELLIGENCE", metadata: { provider_usage: { input_tokens: 1000, output_tokens: 100, cached_input_tokens: 600 } } },
    { module: "INTELLIGENCE", metadata: { provider_usage: { input_tokens: 500, output_tokens: 50, cached_input_tokens: 0 } } },
  ]);
  assert.equal(summary.input_tokens, 1500);
  assert.equal(summary.cached_input_tokens, 600);
  assert.equal(summary.effective_uncached_input_tokens, 900);
  assert.equal(summary.cache_observed_calls, 2);
  assert.equal(summary.cache_hit_calls, 1);
  assert.equal(summary.cache_hit_ratio, 0.5);
  assert.equal(summary.cached_input_ratio, 0.4);
});

test("operating health reports cache economics without changing pricing authority", () => {
  const result = assessIntelligenceOperatingHealth(
    { calls: 10, cache_hit_ratio: 0.7, cached_input_ratio: 0.45, stable_context_reuse_ratio: 0.8 },
    {},
    {},
  );
  assert.equal(result.metrics.cache_hit_ratio, 0.7);
  assert.equal(result.metrics.cached_input_ratio, 0.45);
  assert.equal(result.metrics.stable_context_reuse_ratio, 0.8);
  assert.equal(result.governance.cache_pricing_changed, false);
});
test("cache economics compares observed hit and miss latency", () => {
  const summary = summarizeIntelligenceUsage([
    { module: "INTELLIGENCE", latency_ms: 900, metadata: { provider_usage: { input_tokens: 1000, output_tokens: 50, cached_input_tokens: 700 } } },
    { module: "INTELLIGENCE", latency_ms: 1100, metadata: { provider_usage: { input_tokens: 900, output_tokens: 40, cached_input_tokens: 500 } } },
    { module: "INTELLIGENCE", latency_ms: 1600, metadata: { provider_usage: { input_tokens: 800, output_tokens: 30, cached_input_tokens: 0 } } },
  ]);
  assert.equal(summary.cache_hit_latency_samples, 2);
  assert.equal(summary.cache_miss_latency_samples, 1);
  assert.equal(summary.cache_hit_latency_ms, 1000);
  assert.equal(summary.cache_miss_latency_ms, 1600);
  assert.equal(summary.cache_latency_delta_ms, -600);
});

test("cache diagnostics expose structural reuse opportunity", () => {
  const summary = summarizeIntelligenceUsage([
    { module: "INTELLIGENCE", metadata: { intelligence_operator_context_fingerprint: { static_context_fingerprint: "a", cacheable_static_chars: 800, volatile_chars: 200 } } },
    { module: "INTELLIGENCE", metadata: { intelligence_operator_context_fingerprint: { static_context_fingerprint: "a", cacheable_static_chars: 900, volatile_chars: 100 } } },
    { module: "INTELLIGENCE", metadata: { intelligence_operator_context_fingerprint: { static_context_fingerprint: "b", cacheable_static_chars: 700, volatile_chars: 300 } } },
  ]);
  assert.equal(summary.unique_static_contexts, 2);
  assert.equal(summary.cacheable_static_chars, 2400);
  assert.equal(summary.volatile_chars, 600);
  assert.equal(summary.structural_cacheable_ratio, 0.8);
  assert.equal(summary.stable_context_reuse_ratio, 0.3333);
});

test("health flags high reuse opportunity with persistently low real cache hits", () => {
  const result = assessIntelligenceOperatingHealth({ calls: 20, cache_observed_calls: 20, stable_context_reuse_ratio: 0.7, cache_hit_ratio: 0.1 }, {}, {});
  assert.ok(result.signals.includes("CACHE_REUSE_UNDERPERFORMING"));
  assert.equal(result.status, "HEALTHY");
  assert.equal(result.governance.cache_pricing_changed, false);
});
