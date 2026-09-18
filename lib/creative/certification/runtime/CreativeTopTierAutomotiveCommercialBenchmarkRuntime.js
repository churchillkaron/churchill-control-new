import crypto from "node:crypto";

export const AVANTIQO_TOP_TIER_AUTOMOTIVE_COMMERCIAL_BENCHMARK_CONTRACT =
  "AVANTIQO_TOP_TIER_AUTOMOTIVE_COMMERCIAL_BENCHMARK_V1";

const REQUIRED_ENGINE_IDS = Object.freeze([
  "MODEL_RIG_HOST",
  "MATERIAL_LAB",
  "CYCLES_AOV_RENDER",
  "SIMULATION_PHYSICS",
  "CINEMATIC_MOTION",
  "LAYERED_COMPOSITING",
  "LENS_SENSOR_OPTICS",
  "COLOR_DI",
  "EDITORIAL_PICTURE_LOCK",
  "RENDER_FARM",
  "PRODUCTION_STAGING",
  "TEMPORAL_4K_UPSCALE",
  "AUDIO_POST_MASTER",
]);

const ADVANCED_UPGRADES = Object.freeze([
  "NATIVE_AXF_BTF_MATERIAL_INGEST",
  "MATERIALX_SCENE_MATERIAL_INTERCHANGE",
  "NATIVE_DEEP_EXR_COMPOSITING",
  "OPENUSD_SCENE_COMPOSITION_AND_VARIANTS",
  "OTIO_OR_AAF_EDITORIAL_INTERCHANGE",
  "SURROUND_OBJECT_AUDIO_5_1_7_1_7_1_4_ATMOS",
]);
function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function engineMap(certification = {}) {
  return new Map(list(certification.engines).map((engine) => [text(engine.id), engine]));
}

function check(id, passed, evidence = null, blocker = id) {
  return { id, passed: passed === true, evidence, blocker: passed === true ? null : blocker };
}

export function evaluateTopTierAutomotiveCommercialBenchmark(input = {}) {
  const cinema = object(input.cinema_certification);
  const automotive = object(input.automotive_evidence);
  const usage = object(input.usage);
  const engines = engineMap(cinema);

  const checks = REQUIRED_ENGINE_IDS.map((id) =>
    check(
      "engine:" + id,
      engines.get(id)?.passed === true,
      engines.get(id) || null,
      "AUTOMOTIVE_ENGINE_NOT_CERTIFIED:" + id,
    ),
  );
  checks.push(
    check(
      "automotive_asset_interchange",
      automotive.asset_interchange?.status === "READY",
      automotive.asset_interchange || null,
      "AUTOMOTIVE_ASSET_INTERCHANGE_NOT_READY",
    ),
    check(
      "automotive_cinematography",
      automotive.cinematography?.status === "READY",
      automotive.cinematography || null,
      "AUTOMOTIVE_CINEMATOGRAPHY_NOT_READY",
    ),
    check(
      "environment_binding",
      automotive.environment_binding?.ready === true,
      automotive.environment_binding || null,
      "AUTOMOTIVE_HDR_ENVIRONMENT_BINDING_NOT_READY",
    ),
  );

  if (usage.live_action_plate_integration === true) {
    checks.push(
      check("engine:MATCHMOVE_3D", engines.get("MATCHMOVE_3D")?.passed === true, engines.get("MATCHMOVE_3D") || null, "AUTOMOTIVE_MATCHMOVE_3D_REQUIRED"),
      check("engine:ROTO_MATTING", engines.get("ROTO_MATTING")?.passed === true, engines.get("ROTO_MATTING") || null, "AUTOMOTIVE_ROTO_REQUIRED"),
    );
  }
  if (usage.ai_video_generation === true) {
    checks.push(
      check("engine:VIDEO_GENERATION_1080", engines.get("VIDEO_GENERATION_1080")?.passed === true, engines.get("VIDEO_GENERATION_1080") || null, "AUTOMOTIVE_AI_VIDEO_GENERATION_NOT_CERTIFIED"),
    );
  }
  const failed = checks.filter((item) => !item.passed);
  const upgradeEvidence = object(input.advanced_upgrade_evidence);
  const upgrades = ADVANCED_UPGRADES.map((id) => ({
    id,
    implemented: upgradeEvidence[id]?.implemented === true,
    certified: upgradeEvidence[id]?.certified === true,
    evidence: upgradeEvidence[id] || null,
  }));
  const advancedCertified = upgrades.every((item) => item.certified);

  const body = {
    contract: AVANTIQO_TOP_TIER_AUTOMOTIVE_COMMERCIAL_BENCHMARK_CONTRACT,
    benchmark_class: "TOP_TIER_AUTOMOTIVE_COMMERCIAL",
    minimum_grade_passed: failed.length === 0,
    minimum_status: failed.length ? "BLOCKED" : "TOP_TIER_AUTOMOTIVE_COMMERCIAL_READY",
    minimum_checks: checks,
    minimum_blockers: failed.map((item) => item.blocker),
    usage: {
      live_action_plate_integration: usage.live_action_plate_integration === true,
      ai_video_generation: usage.ai_video_generation === true,
    },
    advanced_upgrades: upgrades,
    beyond_parity_certified: advancedCertified,
    beyond_parity_status: advancedCertified ? "BEYOND_PARITY_CERTIFIED" : "UPGRADES_AVAILABLE",
    policy: {
      brand_affiliation_not_claimed: true,
      benchmark_is_quality_and_pipeline_parity_only: true,
      conditional_engines_only_required_when_used: true,
      advanced_upgrades_do_not_weaken_minimum_gate: true,
    },
  };
  return { ...body, benchmark_hash: hash(body) };
}

export const CreativeTopTierAutomotiveCommercialBenchmarkRuntime = Object.freeze({
  contract: AVANTIQO_TOP_TIER_AUTOMOTIVE_COMMERCIAL_BENCHMARK_CONTRACT,
  required_engine_ids: REQUIRED_ENGINE_IDS,
  advanced_upgrades: ADVANCED_UPGRADES,
  evaluate: evaluateTopTierAutomotiveCommercialBenchmark,
});
