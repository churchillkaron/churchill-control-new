function sceneDuration(totalDuration, count) {
  return Math.max(
    4,
    Math.round(
      Number(totalDuration || 30) /
        Math.max(1, count)
    )
  );
}

function providerNeedFromDecision(decision) {
  if (
    decision.production_method === "existing_asset"
  ) {
    return "editor";
  }

  if (
    decision.production_method === "motion_graphic"
  ) {
    return "compositor";
  }

  if (
    decision.production_method === "generated_scene"
  ) {
    return "video-generation";
  }

  return "mixed";
}

export function buildProductionGraph({
  knowledgeGraph,
  decisions,
  verification,
}) {
  const scenes =
    decisions.map(
      (decision, index) => ({
        id:
          `scene_${String(index + 1).padStart(2, "0")}`,
        order:
          index + 1,
        problem_id:
          decision.problem_id,
        problem_type:
          decision.problem_type,
        duration_seconds:
          sceneDuration(
            knowledgeGraph.duration_seconds,
            decisions.length
          ),
        purpose:
          decision.title,
        creative_decision:
          decision.description,
        production_method:
          decision.production_method,
        required_assets:
          decision.required_assets || [],
        provider_capability_needed:
          providerNeedFromDecision(
            decision
          ),
        render_policy:
          decision.production_method === "generated_scene"
            ? "render_only_after_asset_search_fails"
            : "use_existing_or_edit_first",
        prompt:
          null,
        provider_request:
          null,
        status:
          "planned",
        quality_score:
          null,
      })
    );

  return {
    production_version:
      "creative-search-runtime-v2",
    status:
      verification.passed
        ? "verified_plan"
        : "needs_revision",
    objective:
      knowledgeGraph.objective,
    platform:
      knowledgeGraph.platform,
    duration_seconds:
      knowledgeGraph.duration_seconds,
    budget_mode:
      knowledgeGraph.budget_mode,
    business:
      knowledgeGraph.business,
    brand:
      knowledgeGraph.brand,
    quality_standard: {
      minimum_scene_score: 88,
      regenerate_below_score: 80,
      require_brand_fit: true,
      require_non_ai_feel: true,
      require_asset_search_before_generation: true,
    },
    render_strategy: {
      use_existing_assets_first: true,
      generate_only_missing_scenes: true,
      never_render_bulk_candidates: true,
      regenerate_only_failed_scene: true,
      provider_selected_per_scene: true,
    },
    scenes,
    verification,
  };
}
