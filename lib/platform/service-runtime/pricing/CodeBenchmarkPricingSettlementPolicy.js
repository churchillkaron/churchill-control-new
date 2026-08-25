const OWNED_PROVIDER = "avantiqo-code";
const CODE_DEBUG_CAPABILITY = "ai.code.debug";
const MARKET_PARITY_READY = "MARKET_PARITY_READY";

function text(value) {
  return String(value ?? "").trim();
}

export function codeBenchmarkPricingSettlementAllowed(pricing = {}, {
  nodeEnv = process.env.NODE_ENV,
} = {}) {
  if (text(nodeEnv).toLowerCase() !== "development") return false;

  return Boolean(
    pricing?.active === false &&
    text(pricing?.provider) === OWNED_PROVIDER &&
    text(pricing?.capability) === CODE_DEBUG_CAPABILITY &&
    pricing?.metadata?.owned_inference === true &&
    pricing?.metadata?.runtime_compatible === true &&
    pricing?.metadata?.model_license_verified === true &&
    text(pricing?.metadata?.pricing_status).toUpperCase() === MARKET_PARITY_READY &&
    pricing?.metadata?.production_routing_allowed === false
  );
}

export const CodeBenchmarkPricingSettlementPolicy = Object.freeze({
  provider: OWNED_PROVIDER,
  capability: CODE_DEBUG_CAPABILITY,
  allows: codeBenchmarkPricingSettlementAllowed,
});
