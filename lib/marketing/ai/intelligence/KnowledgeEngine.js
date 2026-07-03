function normalizeArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

export function buildKnowledgeGraph({
  tenantId,
  pageId,
  objective,
  platform,
  durationSeconds,
  budgetMode,
  business = {},
  brand = {},
  assets = [],
  campaignMemory = [],
  performanceMemory = [],
  userInput = {},
}) {
  const safeAssets =
    normalizeArray(assets)
      .filter(Boolean)
      .map((asset, index) => ({
        id:
          asset.id ||
          asset.asset_id ||
          `asset_${index + 1}`,
        name:
          asset.name ||
          asset.title ||
          "",
        type:
          asset.asset_type ||
          asset.type ||
          "unknown",
        url:
          asset.image_url ||
          asset.file_url ||
          asset.thumbnail_url ||
          asset.url ||
          null,
        analysis:
          asset.analysis || {},
        tags:
          normalizeArray(asset.tags),
        score:
          asset.score ||
          asset.asset_score ||
          null,
      }));

  return {
    graph_version: "creative-knowledge-v1",
    tenant_id: tenantId || null,
    page_id: pageId || null,
    objective:
      objective ||
      userInput?.objective ||
      userInput?.goal ||
      "Create an effective advertisement.",
    platform:
      platform ||
      userInput?.platform ||
      "facebook",
    duration_seconds:
      Number(
        durationSeconds ||
        userInput?.durationSeconds ||
        30
      ),
    budget_mode:
      budgetMode ||
      userInput?.budgetMode ||
      "cost-effective",
    business,
    brand,
    assets: safeAssets,
    memory: {
      campaign_memory:
        normalizeArray(campaignMemory),
      performance_memory:
        normalizeArray(performanceMemory),
    },
    constraints: {
      avoid_hardcoded_prompts: true,
      no_single_llm_final_decision: true,
      prefer_real_assets: true,
      minimize_render_cost: true,
      generator_is_worker_only: true,
      avantiqo_owns_decisions: true,
      store_decisions_not_prompts: true,
    },
  };
}

export function decomposeCreativeProblems(knowledgeGraph) {
  return [
    {
      id: "problem_01",
      type: "attention",
      need: "Create immediate attention without feeling generic or AI-made.",
      weight: 1.0,
    },
    {
      id: "problem_02",
      type: "trust",
      need: "Make the business feel real, credible, and specific.",
      weight: 0.95,
    },
    {
      id: "problem_03",
      type: "desire",
      need: "Make the viewer want the product, service, or experience.",
      weight: 0.95,
    },
    {
      id: "problem_04",
      type: "proof",
      need: "Show believable evidence that the business can deliver.",
      weight: 0.85,
    },
    {
      id: "problem_05",
      type: "action",
      need: "Move the viewer toward the campaign objective.",
      weight: 0.9,
    },
    {
      id: "problem_06",
      type: "cost_control",
      need: "Reduce unnecessary AI video rendering and reuse strong assets.",
      weight: 1.0,
    },
  ].map((problem) => ({
    ...problem,
    platform: knowledgeGraph.platform,
    duration_seconds:
      knowledgeGraph.duration_seconds,
    budget_mode:
      knowledgeGraph.budget_mode,
  }));
}
