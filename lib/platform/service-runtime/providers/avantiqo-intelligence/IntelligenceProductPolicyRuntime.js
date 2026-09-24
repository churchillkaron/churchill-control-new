import resolveBusinessPartnerIntelligencePolicy from "./BusinessPartnerIntelligencePolicyRuntime.js";
import resolveCodeIntelligencePolicy from "./CodeIntelligencePolicyRuntime.js";
import { DEFAULT_INTELLIGENCE_RUNTIME_MODEL } from "./IntelligenceModelRegistry.js";

const DEFAULT_MODEL = DEFAULT_INTELLIGENCE_RUNTIME_MODEL;

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
