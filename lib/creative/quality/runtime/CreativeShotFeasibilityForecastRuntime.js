export const CREATIVE_SHOT_FEASIBILITY_FORECAST_CONTRACT = "CREATIVE_SHOT_FEASIBILITY_FORECAST_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function text(value) {
  return String(value ?? "").trim();
}
function lower(value) {
  return text(value).toLowerCase();
}

function addRisk(risks, id, score, reason, mitigation, structural = false) {
  risks.push({ id, score, reason, mitigation, structural });
}

export function forecastShotFeasibility({ shot = {}, scene = {} } = {}) {
  const strategy = object(shot.generation_strategy);
  const factors = object(strategy.complexity_factors);
  const risks = [];

  if (factors.human_performance && factors.moving_threat) {
    addRisk(
      risks,
      "HUMAN_THREAT_INTERACTION",
      18,
      "Human performance and moving threat choreography must both remain spatially and emotionally coherent.",
      "Keep target/threat geometry explicit and isolate threat/hero layer when complexity is high.",
      true,
    );
  }
  if (factors.weather_atmosphere && factors.contact_physics) {
    addRisk(
      risks,
      "WEATHER_CONTACT_PHYSICS",
      16,
      "Rain/fog plus mud, slips, branch contact or impact increases temporal and physical failure probability.",
      "Separate atmosphere and physical interaction responsibilities; bind wetness and terrain state across passes.",
      true,
    );
  }
  if (factors.transformation_vfx) {
    addRisk(
      risks,
      "TRANSFORMATION_VFX",
      22,
      "Transformation/VFX can overwrite material truth, identity and continuity if baked into one generation.",
      "Use dedicated VFX/transformation pass after approved base performance and environment.",
      true,
    );
  }
  if (factors.identity_continuity && factors.human_performance) {
    addRisk(
      risks,
      "IDENTITY_PERFORMANCE_DRIFT",
      14,
      "Identity continuity is at risk when facial performance and body action vary across generated shots.",
      "Use approved shared keyframes/identity state and closing-to-opening handoff.",
      true,
    );
  }
  if (factors.reconstruction) {
    addRisk(
      risks,
      "RECONSTRUCTION_GEOMETRY",
      20,
      "Reconstructed environments can drift in scale, topology, occlusion and practical lighting.",
      "Require scene reconstruction QC and a governed base plate before motion generation.",
      true,
    );
  }

  const camera = object(shot.camera);
  const cameraText = lower([camera.movement_path, camera.angle, camera.framing, camera.lens_intent].map(text).join(" "));
  if (/orbit|whip|crane|handheld|low angle|macro|extreme close/.test(cameraText) && factors.contact_physics) {
    addRisk(
      risks,
      "CAMERA_ACTION_COMPLEXITY",
      10,
      "Complex camera behavior combined with physical contact raises motion, focus and anatomy risk.",
      "Simplify one variable or split the action into connected shots before generation.",
      false,
    );
  }

  const env = object(shot.environmental_continuity_state);
  if (factors.weather_atmosphere &&
      [env.precipitation_state, env.atmosphere_density, env.lightning_state].filter((v) => text(v).length >= 8).length < 2) {
    addRisk(
      risks,
      "ENVIRONMENT_STATE_UNDERSPECIFIED",
      18,
      "Atmospheric complexity is visible but the physical state contract is under-specified.",
      "Author rain/fog/lightning continuity before generation.",
      true,
    );
  }

  const performance = object(shot.pursuit_performance_choreography);
  if (factors.human_performance &&
      Object.keys(performance).length > 0 &&
      list(performance.micro_behavior_cues).length === 0) {
    addRisk(
      risks,
      "PERFORMANCE_MICROTRUTH_UNDERSPECIFIED",
      12,
      "Human performance lacks specific observable micro-behavior.",
      "Author visible eye, breath, jaw, hand, posture or recovery cues that match the framing.",
      false,
    );
  }

  const complexity = Number(strategy.complexity_score || 0);
  let riskScore = Math.min(100, risks.reduce((sum, risk) => sum + Number(risk.score || 0), complexity * 6));
  if (text(strategy.mode) === "MULTIPASS_COMPLEX") riskScore = Math.max(riskScore, 55);
  const structuralRisks = risks.filter((risk) => risk.structural);
  const readiness = structuralRisks.length >= 3 || riskScore >= 78
    ? "REDESIGN_REQUIRED"
    : riskScore >= 50
      ? "DECOMPOSE_BEFORE_GENERATION"
      : "READY_WITH_GATES";

  return Object.freeze({
    contract: CREATIVE_SHOT_FEASIBILITY_FORECAST_CONTRACT,
    shot_id: text(shot.id) || null,
    scene_id: text(scene.id || shot.scene_id) || null,
    risk_score: riskScore,
    readiness,
    structural_risk_count: structuralRisks.length,
    risks,
    highest_risk: risks.slice().sort((a, b) => b.score - a.score)[0] || null,
    required_action:
      readiness === "REDESIGN_REQUIRED"
        ? "REDESIGN_OR_SPLIT_SHOT_BEFORE_ANY_PAID_MEDIA_GENERATION"
        : readiness === "DECOMPOSE_BEFORE_GENERATION"
          ? "USE_MULTIPASS_OR_SPLIT_RESPONSIBILITIES_BEFORE_PAID_MEDIA_GENERATION"
          : "PROCEED_ONLY_THROUGH_EXISTING_PREFLIGHT_AND_QUALITY_GATES",
    zero_provider_calls: true,
    zero_paid_media_generation: true,
  });
}

export const CreativeShotFeasibilityForecastRuntime = Object.freeze({
  contract: CREATIVE_SHOT_FEASIBILITY_FORECAST_CONTRACT,
  forecast: forecastShotFeasibility,
});
