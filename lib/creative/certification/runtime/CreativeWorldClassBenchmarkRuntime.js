import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const CONTRACT = "AVANTIQO_STUDIO_WORLD_CLASS_BENCHMARK_V1";
const FLOOR = 94;

const CASES = Object.freeze([
  ["REALISTIC_HUMANS", ["anatomy_score", "identity_score", "temporal_identity_consistency_score"]],
  ["PERFORMANCE_DIALOGUE", ["performance_score"]],
  ["CAMERA_AERIAL", ["camera_score"]],
  ["ENVIRONMENT_WORLD", ["environment_score", "continuity_score"]],
  ["VFX_PHYSICS", ["physics_score", "artifact_score"]],
  ["BRAND_PRODUCT_FIDELITY", ["product_fidelity_score"]],
  ["EMOTIONAL_STORY", ["story_score"]],
  ["MOTION_GRAPHICS_TEXT", []],
  ["COLOR_FINISHING", []],
  ["SOUND_MASTERING", []],
  ["MULTI_VERSION_DELIVERY", []],
  ["AUTONOMOUS_RECOVERY", []],
]);

function text(value) { return String(value ?? "").trim(); }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function deepEvidence(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 8) return [];
  const results = [object(value)];
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") results.push(...deepEvidence(child, depth + 1));
  }
  return results;
}
function scoreEvidence(nodes = [], tasks = [], field) {
  const values = [];
  for (const source of [...nodes, ...tasks]) {
    for (const evidence of deepEvidence(source)) {
      const score = finite(evidence[field]);
      if (score !== null) values.push(score);
    }
  }
  return values;
}
function contractPresent(nodes, tasks, pattern) {
  const regex = new RegExp(pattern);
  return [...nodes, ...tasks].some((item) =>
    deepEvidence(item).some((evidence) =>
      Object.values(evidence).some((value) => typeof value === "string" && regex.test(value)),
    ),
  );
}

export const CreativeWorldClassBenchmarkRuntime = Object.freeze({
  contract: CONTRACT,
  world_class_floor: FLOOR,
  benchmark_cases: CASES.map(([id]) => id),
  evidence_only: true,
  provider_calls_executed: 0,

  async inspect({ organization_id, creative_project_id } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    const [nodes, tasks] = await Promise.all([
      AssetGraphRepository.listByProject({ organization_id, creative_project_id }),
      ProductionTaskRuntime.list({ organization_id, creative_project_id }),
    ]);

    const special = {
      MOTION_GRAPHICS_TEXT: contractPresent(nodes, tasks, "AVANTIQO_MOTION_GRAPHICS_(QC_)?V1"),
      COLOR_FINISHING: contractPresent(nodes, tasks, "AVANTIQO_COLOR_FINISHING_(QC_)?V1|AVANTIQO_SDR_REC709_MASTER_V1"),
      SOUND_MASTERING: contractPresent(nodes, tasks, "AVANTIQO_CINEMATIC_AUDIO_MASTER(_QC)?_V1"),
      MULTI_VERSION_DELIVERY: contractPresent(nodes, tasks, "AVANTIQO_MULTI_VERSION_AUDIENCE_OUTPUT_V1|CREATIVE_TEMPORAL_CHANNEL_DELIVERY_V4"),
      AUTONOMOUS_RECOVERY: contractPresent(nodes, tasks, "AVANTIQO_AUTONOMOUS_RECOVERY_V1"),
    };

    const cases = CASES.map(([id, fields]) => {
      if (!fields.length) {
        const passed = special[id] === true;
        return {
          id,
          passed,
          floor: FLOOR,
          evidence_mode: "CERTIFIED_CONTRACT_EVIDENCE",
          blockers: passed ? [] : [`${id}_CERTIFIED_EVIDENCE_REQUIRED`],
        };
      }
      const dimensions = fields.map((field) => {
        const values = scoreEvidence(nodes, tasks, field);
        const best = values.length ? Math.max(...values) : null;
        return { field, sample_count: values.length, best_score: best, passed: best !== null && best >= FLOOR };
      });
      const passed = dimensions.every((item) => item.passed);
      return {
        id,
        passed,
        floor: FLOOR,
        evidence_mode: "MEASURED_QUALITY_SCORE",
        dimensions,
        blockers: passed ? [] : dimensions.filter((item) => !item.passed).map((item) => `${id}:${item.field}:WORLD_CLASS_EVIDENCE_REQUIRED`),
      };
    });

    const failed = cases.filter((item) => !item.passed);
    return {
      contract: CONTRACT,
      project_id: creative_project_id,
      passed: failed.length === 0,
      status: failed.length ? "BLOCKED" : "CERTIFIED",
      world_class_floor: FLOOR,
      case_count: cases.length,
      passed_case_count: cases.length - failed.length,
      cases,
      blockers: failed.flatMap((item) => item.blockers),
      benchmark_does_not_lower_quality_floor: true,
      benchmark_does_not_authorize_publication: true,
      provider_calls_executed: 0,
    };
  },
});
