import crypto from "node:crypto";

const CONTRACT = "AVANTIQO_BUDGET_QUALITY_OPTIMIZATION_V1";
const SHOT_CONTRACT = "AVANTIQO_BUDGET_QUALITY_SHOT_POLICY_V1";

function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function text(value) { return String(value ?? "").trim(); }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).filter((key) => !["policy_hash"].includes(key)).sort().map((key) => [key, canonical(value[key])]));
}
function digest(value) { return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }

function sourceShots(input = {}, scenes = []) {
  if (list(input.shots).length) return list(input.shots);
  return scenes.flatMap((scene) => list(scene.shots).map((shot) => ({ ...shot, scene_id: shot.scene_id || scene.id })));
}

function scoreShot(shot = {}, index = 0, total = 1) {
  const directing = object(shot.directing_intelligence);
  const escalation = object(shot.story_escalation);
  const human = object(shot.human_performance);
  const vfx = object(shot.vfx_contract || shot.vfx);
  const simulation = object(shot.simulation_contract || shot.simulation);
  const identity = object(shot.identity_requirements || shot.identity_contract);
  let score = 35;
  if (index === 0 || index === total - 1) score += 10;
  if (text(escalation.story_progression_role) === "LAND_SCENE_CHANGE") score += 12;
  if (Object.keys(human).length) score += 10;
  if (Object.keys(identity).length) score += 8;
  if (Object.keys(vfx).length) score += 8;
  if (Object.keys(simulation).length) score += 8;
  if (text(directing.signature_device_decision)) score += 4;
  const negativeCount = list(shot.negative_constraints).length;
  const failureCount = list(shot.known_failure_modes).length;
  score += Math.min(5, Math.floor((negativeCount + failureCount) / 2));
  return Math.max(0, Math.min(100, score));
}

function tierFor(score) {
  if (score >= 80) return "HERO";
  if (score >= 60) return "CRITICAL";
  if (score >= 45) return "STANDARD";
  return "ECONOMY";
}

function weightsFor(tier) {
  if (tier === "HERO") return { quality: 7, reliability: 6, speed: 1, cost: 1 };
  if (tier === "CRITICAL") return { quality: 6, reliability: 5, speed: 2, cost: 1 };
  if (tier === "STANDARD") return { quality: 5, reliability: 4, speed: 2, cost: 2 };
  return { quality: 4, reliability: 4, speed: 3, cost: 4 };
}

function attemptsFor(tier) {
  if (tier === "HERO") return { initial_candidates: 3, maximum_total_candidates: 5, maximum_repair_rounds: 2 };
  if (tier === "CRITICAL") return { initial_candidates: 2, maximum_total_candidates: 4, maximum_repair_rounds: 2 };
  if (tier === "STANDARD") return { initial_candidates: 2, maximum_total_candidates: 3, maximum_repair_rounds: 1 };
  return { initial_candidates: 1, maximum_total_candidates: 2, maximum_repair_rounds: 1 };
}

function explicitBudget(input = {}) {
  const plan = object(input.creative_plan);
  const project = object(input.project);
  const budget = object(
    input.budget_profile ||
    project.budget_profile ||
    project.metadata?.budget_profile ||
    plan.production?.budget_profile ||
    plan.budget_profile,
  );
  const maximum = finite(
    budget.maximum_customer_price ??
    budget.max_customer_price ??
    budget.total_budget ??
    budget.amount,
  );
  return {
    configured: maximum !== null && maximum >= 0,
    maximum_customer_price: maximum,
    currency: text(budget.currency || project.currency || project.metadata?.currency) || null,
  };
}

function buildPolicy(shot, index, total) {
  const importance = scoreShot(shot, index, total);
  const tier = tierFor(importance);
  const policy = {
    contract: SHOT_CONTRACT,
    shot_id: text(shot.id) || null,
    scene_id: text(shot.scene_id || shot.directing_intelligence?.scene_id) || null,
    importance_score: importance,
    quality_tier: tier,
    service_runtime_selection_weights: weightsFor(tier),
    generation_budget: attemptsFor(tier),
    reuse_preferred_when_existing_candidate_passes_world_class_gate: true,
    repair_preferred_before_full_regeneration_when_failure_is_surgical: true,
    never_lower_quality_floor_to_meet_budget: true,
    never_skip_human_identity_continuity_world_or_safety_gates: true,
    stop_spending_after_world_class_winner_exists: true,
    external_provider_fallback_is_not_forced: true,
    provider_selection_owner: "SERVICE_RUNTIME",
    provider_pin_forbidden: true,
    provider_calls_executed: 0,
  };
  return { ...policy, policy_hash: digest(policy) };
}

export const CreativeBudgetQualityOptimizationRuntime = Object.freeze({
  contract: CONTRACT,
  shot_contract: SHOT_CONTRACT,
  provider_selection_owner: "SERVICE_RUNTIME",
  quality_floor_may_not_be_lowered: true,

  build(input = {}) {
    const plan = object(input.creative_plan);
    if (text(plan.workflow_kind).toUpperCase() !== "TEMPORAL") {
      return { ...input, budget_quality_optimization: { contract: CONTRACT, applicable: false } };
    }
    const scenes = list(input.scenes).length ? list(input.scenes) : list(plan.scenes);
    const shots = sourceShots(input, scenes);
    if (!shots.length) throw new Error("BUDGET_QUALITY_OPTIMIZATION_SHOTS_REQUIRED");
    const policies = shots.map((shot, index) => buildPolicy(shot, index, shots.length));
    const byId = new Map(policies.map((policy) => [text(policy.shot_id), policy]));
    const enrichedShots = shots.map((shot) => ({ ...shot, budget_quality_optimization: byId.get(text(shot.id)) }));
    const enrichedScenes = scenes.map((scene) => ({
      ...scene,
      shots: list(scene.shots).map((shot) => ({ ...shot, budget_quality_optimization: byId.get(text(shot.id)) })),
    }));
    const budget = explicitBudget(input);
    const summary = {
      contract: CONTRACT,
      applicable: true,
      budget,
      shot_policy_count: policies.length,
      hero_shot_count: policies.filter((policy) => policy.quality_tier === "HERO").length,
      critical_shot_count: policies.filter((policy) => policy.quality_tier === "CRITICAL").length,
      standard_shot_count: policies.filter((policy) => policy.quality_tier === "STANDARD").length,
      economy_shot_count: policies.filter((policy) => policy.quality_tier === "ECONOMY").length,
      optimization_policy: "ALLOCATE_MORE_CANDIDATES_AND_REPAIR_BUDGET_TO_HIGH_IMPACT_SHOTS_WITHOUT_LOWERING_QUALITY_FLOORS",
      quality_floor_may_not_be_lowered: true,
      provider_selection_owner: "SERVICE_RUNTIME",
      provider_calls_executed: 0,
    };
    summary.policy_hash = digest({ summary, policies });
    return {
      ...input,
      scenes: enrichedScenes,
      shots: enrichedShots,
      creative_plan: {
        ...plan,
        scenes: enrichedScenes,
        budget_quality_optimization: { ...summary, shot_policies: policies },
      },
      budget_quality_optimization: summary,
    };
  },

  hash: digest,
});

export const AVANTIQO_BUDGET_QUALITY_OPTIMIZATION_CONTRACT = CONTRACT;
