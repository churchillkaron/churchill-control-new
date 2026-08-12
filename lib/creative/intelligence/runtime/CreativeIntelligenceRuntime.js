import {
  analyzeCreativeBusiness,
} from "../analysis/CreativeBusinessAnalyzer";

export const CreativeIntelligenceRuntime = {
  async analyzeBusiness({
    organization = {},
    brand = {},
    industry = null,
    objective = "",
    assets = [],
  }) {
    return analyzeCreativeBusiness({
      organization,
      brand,
      industry,
      objective,
      assets,
    });
  },

  async createCreativePlan({
    organization = {},
    brand = {},
    industry = null,
    objective = "",
    assets = [],
    requestedOutputs = [],
  }) {
    const analysis = analyzeCreativeBusiness({
      organization,
      brand,
      industry,
      objective,
      assets,
    });
    const explicitOutputs = Array.isArray(requestedOutputs)
      ? requestedOutputs.filter(Boolean)
      : [];

    return {
      analysis,
      objective,
      requested_outputs: explicitOutputs,
      recommended_outputs: explicitOutputs,
      output_decision_source: explicitOutputs.length
        ? "EXPLICIT_MISSION_CONSTRAINT"
        : "CREATIVE_DIRECTOR",
      production_direction: {
        source: "CREATIVE_DIRECTOR_RESOLVED_FROM_CONTEXT",
        supplied_asset_count: Array.isArray(assets) ? assets.length : 0,
        quality_policy_source: "CREATIVE_QUALITY_POLICY",
      },
      status: "PLANNED",
    };
  },
};
