import { CreativeReasoningThink } from "@/lib/creative/reasoning/runtime/CreativeReasoningRuntime";

function buildRecommendations(production = {}) {

  const recommendations = [];

  if (
    production.production_graph?.render_strategy
      ?.use_existing_assets_first
  ) {
    recommendations.push({
      id: "reuse-assets",
      title: "Reuse existing assets first",
      priority: "high",
    });
  }

  recommendations.push({
    id: "optimize-sequence",
    title: "Optimize production sequence",
    priority: "high",
  });

  recommendations.push({
    id: "provider-selection",
    title: "Select optimal AI providers",
    priority: "medium",
  });

  recommendations.push({
    id: "cost-estimate",
    title: "Estimate rendering cost",
    priority: "medium",
  });

  recommendations.push({
    id: "publish-readiness",
    title: "Validate publishing readiness",
    priority: "low",
  });

  return recommendations;

}

export const DirectorEngine = {

  id: "director",

  async execute(context = {}) {

    const production =
      await CreativeReasoningThink({

        organizationId: context.organizationId,
        pageId: context.pageId,
        business: context.business || {},
        brand: context.brand || {},
        objective: context.objective || "",
        platform: context.platform || "facebook",
        durationSeconds: context.durationSeconds || 30,
        budgetMode: context.budgetMode || "cost-effective",
        assets: context.assets || [],
        userInput: context,

      });

    return {

      production,

      recommendations:
        buildRecommendations(production),

    };

  },

};
