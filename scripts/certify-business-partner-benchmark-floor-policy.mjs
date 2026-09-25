import {
  BUSINESS_PARTNER_QUALITY_DIMENSIONS,
  BUSINESS_PARTNER_REFERENCE_FAMILIES,
  businessPartnerBenchmarkFloorPolicy,
  evaluateBusinessPartnerBenchmarkFloor,
} from "../lib/intelligence/runtime/AvantiqoBusinessPartnerBenchmarkFloorRuntime.mjs";

const policy = businessPartnerBenchmarkFloorPolicy();
const score = (value) =>
  Object.fromEntries(BUSINESS_PARTNER_QUALITY_DIMENSIONS.map((key) => [key, value]));

const proof = evaluateBusinessPartnerBenchmarkFloor({
  candidate: score(0.95),
  references: {
    chatgpt: score(0.93),
    claude: score(0.94),
    gemini: score(0.92),
  },
  evidenceFresh: true,
  matchedConditions: true,
});

const blocked = evaluateBusinessPartnerBenchmarkFloor({
  candidate: { ...score(0.95), reasoning_quality: 0.93 },
  references: {
    chatgpt: score(0.93),
    claude: score(0.94),
    gemini: score(0.92),
  },
  evidenceFresh: true,
  matchedConditions: true,
});

if (
  policy.immutable_floor !== true ||
  policy.regression_policy !== "BLOCK_RELEASE" ||
  BUSINESS_PARTNER_REFERENCE_FAMILIES.join(",") !== "chatgpt,claude,gemini" ||
  proof.release_eligible !== true ||
  blocked.release_eligible !== false
) {
  throw new Error("BUSINESS_PARTNER_BENCHMARK_FLOOR_POLICY_CERTIFICATION_FAILED");
}

console.log(
  JSON.stringify(
    {
      contract: policy.contract,
      status: "POLICY_CERTIFIED",
      immutable_floor: true,
      reference_families: BUSINESS_PARTNER_REFERENCE_FAMILIES,
      dimension_count: BUSINESS_PARTNER_QUALITY_DIMENSIONS.length,
      per_dimension_strongest_reference_required: true,
      aggregate_cannot_hide_regression: true,
      missing_or_stale_evidence_blocks_release: true,
      external_reference_execution_requires_explicit_authorization: true,
      performance_claim_requires_fresh_measured_evidence: true,
    },
    null,
    2,
  ),
);
