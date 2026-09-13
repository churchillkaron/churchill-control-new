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

test("cache economics compares real generation compute for hits and misses", () => {
  const summary = summarizeIntelligenceUsage([
    { module: "INTELLIGENCE", metadata: { provider_usage: { input_tokens: 1000, cached_input_tokens: 700, engine_prepare_ms: 20, generation_ms: 500, structured_finalization_ms: 50, compute_ms: 550 } } },
    { module: "INTELLIGENCE", metadata: { provider_usage: { input_tokens: 900, cached_input_tokens: 400, engine_prepare_ms: 10, generation_ms: 600, structured_finalization_ms: 0, compute_ms: 600 } } },
    { module: "INTELLIGENCE", metadata: { provider_usage: { input_tokens: 800, cached_input_tokens: 0, engine_prepare_ms: 30, generation_ms: 1000, structured_finalization_ms: 100, compute_ms: 1100 } } },
  ]);
  assert.equal(summary.cache_hit_generation_samples, 2);
  assert.equal(summary.cache_miss_generation_samples, 1);
  assert.equal(summary.cache_hit_generation_ms, 550);
  assert.equal(summary.cache_miss_generation_ms, 1000);
  assert.equal(summary.cache_generation_delta_ms, -450);
  assert.equal(summary.engine_prepare_ms, 20);
  assert.equal(summary.compute_ms, 750);
  assert.equal(summary.structured_finalization_ms, 50);
});


test("unit economics flag stale pricing basis against live runtime", () => {
  const summary = summarizeIntelligenceUsage([
    { module: "INTELLIGENCE", supplier_cost: 2.4, metadata: { provider_usage: { input_tokens: 1000, output_tokens: 100, cached_input_tokens: 600, compute_ms: 1200 }, settled_pricing: { pricing_metadata: { infrastructure_provider: "runpod_serverless" } }, result: { infrastructure_provider: "MODAL_H100_ASYNC_V1" } } },
    { module: "INTELLIGENCE", supplier_cost: 1.2, metadata: { provider_usage: { input_tokens: 500, output_tokens: 50, cached_input_tokens: 0, compute_ms: 800 }, settled_pricing: { pricing_metadata: { infrastructure_provider: "runpod_serverless" } }, result: { infrastructure_provider: "MODAL_H100_ASYNC_V1" } } },
    { module: "INTELLIGENCE", supplier_cost: 1.4, metadata: { provider_usage: { input_tokens: 500, output_tokens: 50, cached_input_tokens: 0, compute_ms: 1000 }, settled_pricing: { pricing_metadata: { infrastructure_provider: "runpod_serverless" } }, result: { infrastructure_provider: "MODAL_H100_ASYNC_V1" } } },
  ]);
  assert.equal(summary.pricing_basis_observed_calls, 3);
  assert.equal(summary.pricing_basis_drift_calls, 3);
  assert.equal(summary.pricing_basis_drift_ratio, 1);
  assert.equal(summary.supplier_cost_per_compute_second, 1.666667);
  assert.equal(summary.supplier_cost_per_effective_uncached_input_1k_tokens, 3.571429);
  const health = assessIntelligenceOperatingHealth(summary, {}, {});
  assert.ok(health.signals.includes("PRICING_BASIS_RUNTIME_DRIFT_HIGH"));
  assert.equal(health.status, "REVIEW");
  assert.equal(health.governance.cache_pricing_changed, false);
});


test("calibration readiness distinguishes provisional from certified aligned pricing", () => {
  const provisional = summarizeIntelligenceUsage([{
    module: "INTELLIGENCE", supplier_cost: 1,
    metadata: { provider_usage: { input_tokens: 500, compute_ms: 500 }, settled_pricing: { pricing_metadata: { infrastructure_provider: "modal_h100", pricing_status: "PROVISIONAL_MEASURED_BASELINE", economics_certified: false, recalibration_required: true } }, result: { infrastructure_provider: "modal_h100" } },
  }]);
  assert.equal(provisional.pricing_calibration_state, "RECALIBRATION_REQUIRED");
  assert.equal(provisional.pricing_calibration_ready_ratio, 0);
  const provisionalHealth = assessIntelligenceOperatingHealth(provisional, {}, {});
  assert.ok(provisionalHealth.signals.includes("PRICING_RECALIBRATION_REQUIRED"));
  assert.equal(provisionalHealth.governance.unit_economics_certified, false);

  const certified = summarizeIntelligenceUsage([{
    module: "INTELLIGENCE", supplier_cost: 1,
    metadata: { provider_usage: { input_tokens: 500, compute_ms: 500 }, settled_pricing: { pricing_metadata: { infrastructure_provider: "modal_h100", pricing_status: "PRODUCTION_CERTIFIED", economics_certified: true, recalibration_required: false } }, result: { infrastructure_provider: "modal_h100" } },
  }]);
  assert.equal(certified.pricing_calibration_state, "CERTIFIED_ALIGNED");
  assert.equal(certified.pricing_calibration_ready_ratio, 1);
  const certifiedHealth = assessIntelligenceOperatingHealth(certified, {}, {});
  assert.equal(certifiedHealth.governance.unit_economics_certified, true);
});

test("cache generation conclusions require balanced evidence and compute coverage is explicit", () => {
  const rows = [];
  for (let index = 0; index < 5; index += 1) rows.push({ module: "INTELLIGENCE", metadata: { provider_usage: { input_tokens: 1000, cached_input_tokens: 500, generation_ms: 500, compute_ms: 500 } } });
  for (let index = 0; index < 5; index += 1) rows.push({ module: "INTELLIGENCE", metadata: { provider_usage: { input_tokens: 1000, cached_input_tokens: 0, generation_ms: 800, compute_ms: 800 } } });
  const sufficient = summarizeIntelligenceUsage(rows);
  assert.equal(sufficient.compute_observed_calls, 10);
  assert.equal(sufficient.compute_observation_coverage_ratio, 1);
  assert.equal(sufficient.cache_generation_evidence, "SUFFICIENT");
  const sparse = summarizeIntelligenceUsage(rows.slice(0, 4));
  assert.equal(sparse.cache_generation_evidence, "INSUFFICIENT");
});
