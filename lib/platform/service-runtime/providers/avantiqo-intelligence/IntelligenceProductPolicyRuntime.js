import resolveBusinessPartnerIntelligencePolicy from "./BusinessPartnerIntelligencePolicyRuntime.js";
import resolveCodeIntelligencePolicy from "./CodeIntelligencePolicyRuntime.js";

const DEFAULT_MODEL = "qwen3:4b-instruct";

export function resolveIntelligenceProductPolicy(input = {}, executionLane = "fast") {
  const business = resolveBusinessPartnerIntelligencePolicy(input, executionLane);
  if (business) return business;

  const code = resolveCodeIntelligencePolicy(input, executionLane);
  if (code) return code;

  return {
    product: "shared",
    contract: executionLane === "deep" ? "shared.reasoning.deep" : "shared.text.generate",
    runtime_model: DEFAULT_MODEL,
    display_model: DEFAULT_MODEL,
  };
}

export default resolveIntelligenceProductPolicy;
