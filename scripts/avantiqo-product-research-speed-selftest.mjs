import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import {
  classifyAvantiqoProductResearchDepth,
} from "../lib/intelligence/runtime/AvantiqoProductResearchGateRuntime.js";
import {
  collectAvantiqoOwnedWebEvidence,
} from "../lib/intelligence/runtime/AvantiqoOwnedWebEvidenceRuntime.js";

const CONTRACT = "AVANTIQO_PRODUCT_RESEARCH_SPEED_SELFTEST_V1";

assert.equal(
  classifyAvantiqoProductResearchDepth({
    focus: "Fix the mobile invoice button layout bug",
  }),
  "repository_only",
);
assert.equal(
  classifyAvantiqoProductResearchDepth({
    focus: "Improve accounting month-end close workflow for an accounting firm",
  }),
  "fast_evidence",
);
assert.equal(
  classifyAvantiqoProductResearchDepth({
    focus: "Make Avantiqo Finance world-class and better than the market",
  }),
  "deep_mechanism",
);

const SOURCE_DELAY_MS = 60;
const startedAt = performance.now();
const evidence = await collectAvantiqoOwnedWebEvidence({
  context: { organizationId: "00000000-0000-4000-8000-000000000001" },
  payload: {
    query: "accounting invoice audit trail",
    domain: "finance",
    minimum_sources: 3,
    max_sources: 3,
  },
  sourceReader: async ({ payload }) => {
    await new Promise((resolve) => setTimeout(resolve, SOURCE_DELAY_MS));
    return {
      source_url: payload.url,
      final_url: payload.url,
      title: "Synthetic authoritative-source timing fixture",
      content: "Verified timing fixture content for bounded parallel source collection.",
      retrieved_at: new Date().toISOString(),
      content_hash_sha256: "fixture",
    };
  },
});
const elapsedMs = Math.round(performance.now() - startedAt);

assert.equal(evidence.sources.length, 3);
assert.ok(
  elapsedMs < SOURCE_DELAY_MS * 2.2,
  `${CONTRACT}_PARALLEL_SOURCE_COLLECTION_TOO_SLOW:${elapsedMs}`,
);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  routing: {
    explicit_local_defect: "repository_only",
    professional_workflow: "fast_evidence",
    market_leadership_or_architecture: "deep_mechanism",
  },
  parallel_source_collection: {
    source_count: evidence.sources.length,
    per_source_fixture_delay_ms: SOURCE_DELAY_MS,
    measured_total_latency_ms: elapsedMs,
    sequential_lower_bound_ms: SOURCE_DELAY_MS * evidence.sources.length,
    parallel_verified: true,
  },
  provider_calls_executed: false,
  provider_spend_performed: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
