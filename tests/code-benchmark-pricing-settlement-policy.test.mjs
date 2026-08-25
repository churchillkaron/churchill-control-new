import assert from "node:assert/strict";
import {
  codeBenchmarkPricingSettlementAllowed,
} from "../lib/platform/service-runtime/pricing/CodeBenchmarkPricingSettlementPolicy.js";

const valid = {
  active: false,
  provider: "avantiqo-code",
  capability: "ai.code.debug",
  metadata: {
    owned_inference: true,
    runtime_compatible: true,
    model_license_verified: true,
    pricing_status: "MARKET_PARITY_READY",
    production_routing_allowed: false,
  },
};

assert.equal(
  codeBenchmarkPricingSettlementAllowed(valid, { nodeEnv: "development" }),
  true,
  "development may settle the exact owned Code debug benchmark price",
);
assert.equal(
  codeBenchmarkPricingSettlementAllowed(valid, { nodeEnv: "production" }),
  false,
  "production must never settle inactive benchmark pricing",
);
assert.equal(
  codeBenchmarkPricingSettlementAllowed(
    { ...valid, provider: "external-provider" },
    { nodeEnv: "development" },
  ),
  false,
  "other providers must remain blocked",
);
assert.equal(
  codeBenchmarkPricingSettlementAllowed(
    { ...valid, capability: "ai.code.generate" },
    { nodeEnv: "development" },
  ),
  false,
  "other capabilities must remain blocked",
);
assert.equal(
  codeBenchmarkPricingSettlementAllowed(
    { ...valid, active: true },
    { nodeEnv: "development" },
  ),
  false,
  "active pricing does not use benchmark settlement override",
);
assert.equal(
  codeBenchmarkPricingSettlementAllowed(
    {
      ...valid,
      metadata: {
        ...valid.metadata,
        production_routing_allowed: true,
      },
    },
    { nodeEnv: "development" },
  ),
  false,
  "benchmark settlement is invalid if production routing is already allowed",
);
assert.equal(
  codeBenchmarkPricingSettlementAllowed(
    {
      ...valid,
      metadata: {
        ...valid.metadata,
        model_license_verified: false,
      },
    },
    { nodeEnv: "development" },
  ),
  false,
  "unverified model licensing must remain blocked",
);

console.log("AVANTIQO_CODE_BENCHMARK_PRICING_SETTLEMENT_POLICY=PASS");
