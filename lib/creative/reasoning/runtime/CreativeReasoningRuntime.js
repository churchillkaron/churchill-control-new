import { reason } from "@/lib/creative/reasoning/CreativeReasoningService";

const CREATIVE_WORKER_CAPABILITIES = Object.freeze([
  "ai.image.generate",
  "ai.image.edit",
  "ai.image.inpaint",
  "ai.image.outpaint",
  "ai.image.upscale",
  "ai.image.analyze",
  "ai.video.generate",
  "ai.video.image_to_video",
  "ai.video.video_to_video",
  "ai.video.edit",
  "ai.video.inpaint",
  "ai.video.extend",
  "ai.video.upscale",
  "ai.video.lipsync",
  "ai.audio.generate",
  "ai.music.generate",
  "ai.sfx.generate",
  "ai.audio.edit",
  "ai.audio.extend",
  "ai.audio.remix",
  "ai.audio.stems",
  "ai.audio.mix",
  "ai.audio.master",
  "ai.code.generate",
  "ai.code.edit",
  "ai.code.refactor",
  "ai.code.review",
  "ai.code.debug",
  "ai.code.test",
  "ai.code.execute",
  "ai.web.build",
  "ai.web.repair",
  "ai.app.build",
  "ai.integration.build",
]);

function normalizeArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

function buildSceneId(index) {
  return `scene_${String(index + 1).padStart(2, "0")}`;
}

function estimateSceneCount(durationSeconds) {
  const duration = Number(durationSeconds || 30);
  if (duration <= 15) return 3;
  if (duration <= 30) return 5;
  if (duration <= 60) return 8;
  if (duration <= 90) return 12;
  return 15;
}

function canonicalCapability(value, fallback = "ai.video.generate") {
  const candidate = String(value || "").trim();
  return CREATIVE_WORKER_CAPABILITIES.includes(candidate) ? candidate : fallback;
}

function buildInitialProduction({
  organizationId,
  pageId,
  business,
  brand,
  objective,
  platform,
  durationSeconds,
  budgetMode,
  assets,
  userInput,
}) {
  return {
    production_version: "creative-runtime-v2-capability-native",
    organization_id: organizationId || null,
    page_id: pageId || null,
    status: "planned",
    source: "avantiqo-creative-runtime",
    objective: objective || userInput?.objective || userInput?.goal || "Create a high-performing creative solution.",
    platform: platform || userInput?.platform || "facebook",
    duration_seconds: Number(durationSeconds || userInput?.durationSeconds || 30),
    budget_mode: budgetMode || userInput?.budgetMode || "cost-effective",
    business: business || {},
    brand: brand || {},
    assets: normalizeArray(assets),
    constraints: {
      avoid_hardcoded_prompts: true,
      prefer_real_assets: true,
      minimize_render_cost: true,
      generator_is_worker_only: true,
      avantiqo_owns_decisions: true,
      capability_only_orchestration: true,
      provider_selection_hidden_behind_service_runtime: true,
      raw_reasoning_persisted: false,
    },
    knowledge: [],
    decision_trace: [],
    hypotheses: [],
    production_graph: {
      emotional_journey: [],
      story_candidates: [],
      selected_story: null,
      scenes: [],
      render_strategy: null,
      quality_standard: {
        minimum_scene_score: 88,
        regenerate_below_score: 80,
        require_brand_fit: true,
        require_non_ai_feel: true,
      },
    },
  };
}

async function addDecision(production, task, input, outputShape) {
  const result = await reason({
    task,
    input,
    constraints: production.constraints,
    outputShape,
  });

  production.decision_trace.push({
    task,
    confidence: result.confidence,
    result: result.result,
    execution_source: result.execution_source || "governed_service_runtime",
    raw_reasoning_persisted: false,
    provider_selection_persisted: false,
    created_at: new Date().toISOString(),
  });

  return result.result;
}

function buildDraftScenes({ production, storyResult, sceneResult }) {
  const count = estimateSceneCount(production.duration_seconds);
  const suggested = normalizeArray(sceneResult?.scenes);
  const scenes = [];

  for (let i = 0; i < count; i++) {
    const source = suggested[i] || {};
    const capabilityNeeded = canonicalCapability(source.capability_needed);

    scenes.push({
      id: buildSceneId(i),
      order: i + 1,
      duration_seconds: Math.max(
        4,
        Math.round(production.duration_seconds / count),
      ),
      purpose:
        source.purpose ||
        source.role ||
        `Advance the selected story: ${storyResult?.selectedStory || "business objective"}`,
      emotion:
        source.emotion ||
        production.production_graph.emotional_journey[
          i % Math.max(1, production.production_graph.emotional_journey.length)
        ] ||
        "attention",
      asset_strategy: source.asset_strategy || "use_existing_asset_first",
      generation_need: source.generation_need || "only_if_no_suitable_asset",
      capability_needed: capabilityNeeded,
      capability_resolution_contract: "SERVICE_RUNTIME_OWNED_FIRST",
      render_cost_policy: "do_not_render_until_plan_is_approved",
      prompt: null,
      provider_request: null,
      quality_score: null,
      status: "planned",
    });
  }

  return scenes;
}

export async function CreativeReasoningThink({
  organizationId,
  pageId,
  business = {},
  brand = {},
  objective = "",
  platform = "facebook",
  durationSeconds = 30,
  budgetMode = "cost-effective",
  assets = [],
  userInput = {},
}) {
  const production = buildInitialProduction({
    organizationId,
    pageId,
    business,
    brand,
    objective,
    platform,
    durationSeconds,
    budgetMode,
    assets,
    userInput,
  });

  const strategy = await addDecision(
    production,
    "Find the strongest advertising strategy for this business objective.",
    {
      organization_id: organizationId,
      objective: production.objective,
      platform: production.platform,
      duration_seconds: production.duration_seconds,
      budget_mode: production.budget_mode,
      business,
      brand,
      asset_count: production.assets.length,
    },
    {
      result: {
        audience: "string",
        emotionalJourney: ["string"],
        creativeHypotheses: ["string"],
        risks: ["string"],
      },
    },
  );

  production.audience = strategy?.audience || "best available audience";
  production.production_graph.emotional_journey = normalizeArray(strategy?.emotionalJourney);
  production.hypotheses = normalizeArray(strategy?.creativeHypotheses);
  production.risks = normalizeArray(strategy?.risks);

  const story = await addDecision(
    production,
    "Create multiple story candidates and select the strongest one without using hardcoded templates.",
    {
      organization_id: organizationId,
      objective: production.objective,
      audience: production.audience,
      emotional_journey: production.production_graph.emotional_journey,
      business,
      brand,
      platform: production.platform,
      duration_seconds: production.duration_seconds,
      assets: production.assets.slice(0, 12),
    },
    {
      result: {
        storyCandidates: ["string"],
        selectedStory: "string",
        selectionReason: "string",
      },
    },
  );

  production.production_graph.story_candidates = normalizeArray(story?.storyCandidates);
  production.production_graph.selected_story = {
    story:
      story?.selectedStory ||
      production.production_graph.story_candidates[0] ||
      "Business-first authentic campaign",
    reason: story?.selectionReason || "Selected by Avantiqo Creative Intelligence.",
  };

  const scenes = await addDecision(
    production,
    "Plan the scenes needed to express the selected story with minimum rendering cost. For every scene choose exactly one supplied canonical capability_needed. Never name or choose an AI vendor/provider.",
    {
      organization_id: organizationId,
      objective: production.objective,
      audience: production.audience,
      emotional_journey: production.production_graph.emotional_journey,
      selected_story: production.production_graph.selected_story,
      duration_seconds: production.duration_seconds,
      budget_mode: production.budget_mode,
      asset_count: production.assets.length,
      available_assets: production.assets.slice(0, 20),
      available_worker_capabilities: CREATIVE_WORKER_CAPABILITIES,
    },
    {
      result: {
        scenes: [
          {
            purpose: "string",
            emotion: "string",
            asset_strategy: "string",
            generation_need: "string",
            capability_needed: "exact supplied canonical capability string",
          },
        ],
      },
    },
  );

  production.production_graph.scenes = buildDraftScenes({
    production,
    storyResult: production.production_graph.selected_story,
    sceneResult: scenes,
  });

  const renderStrategy = await addDecision(
    production,
    "Decide a capability-level production strategy that gives high quality while avoiding unnecessary generation. Do not choose or discuss AI vendors/providers.",
    {
      organization_id: organizationId,
      objective: production.objective,
      scenes: production.production_graph.scenes,
      assets: production.assets,
      budget_mode: production.budget_mode,
      constraints: production.constraints,
      available_worker_capabilities: CREATIVE_WORKER_CAPABILITIES,
    },
    {
      result: {
        useExistingAssetsFirst: "boolean",
        maxDraftRenders: "number",
        maxFinalRenders: "number",
        costControlRules: ["string"],
      },
    },
  );

  production.production_graph.render_strategy = {
    use_existing_assets_first: renderStrategy?.useExistingAssetsFirst !== false,
    max_draft_renders: Number(renderStrategy?.maxDraftRenders || 2),
    max_final_renders: Number(renderStrategy?.maxFinalRenders || 4),
    execution_policy: "CAPABILITY_ONLY_SERVICE_RUNTIME_OWNED_FIRST",
    provider_selection_exposed: false,
    cost_control_rules: normalizeArray(renderStrategy?.costControlRules).length
      ? normalizeArray(renderStrategy?.costControlRules)
      : [
          "Never generate scenes that can be built from strong existing assets.",
          "Use bounded drafts before expensive final generation when useful.",
          "Repair or regenerate only failed scenes, never the whole production.",
          "Store reusable approved assets in the asset library.",
        ],
  };

  return production;
}

export const CreativeWorkerCapabilityCatalog = CREATIVE_WORKER_CAPABILITIES;
