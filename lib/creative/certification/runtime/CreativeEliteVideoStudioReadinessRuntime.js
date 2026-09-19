import crypto from "node:crypto";

export const AVANTIQO_ELITE_VIDEO_STUDIO_READINESS_CONTRACT =
  "AVANTIQO_ELITE_VIDEO_STUDIO_READINESS_V1";

const SYSTEMS = Object.freeze([
  ["DEEP_EXR", "AVANTIQO_DEEP_EXR_COMPOSITING_V1"],
  ["DISTRIBUTED_RENDER_FARM", "AVANTIQO_DISTRIBUTED_RENDER_WORKER_V1"],
  ["PROFESSIONAL_MATCHMOVE", "AVANTIQO_PROFESSIONAL_MATCHMOVE_AUTHORITY_V1"],
  ["PROFESSIONAL_ROTO", "AVANTIQO_PROFESSIONAL_ROTO_MATTING_V1"],
  ["PROFESSIONAL_COMPOSITING_GRAPH", "AVANTIQO_PROFESSIONAL_COMPOSITING_GRAPH_V1"],
  ["OTIO", "AVANTIQO_OTIO_EDITORIAL_HANDOFF_V1"],
  ["AAF", "AVANTIQO_AAF_EDITORIAL_HANDOFF_V1"],
  ["LENS_STMAP", "AVANTIQO_LENS_STMAP_CALIBRATION_V1"],
  ["VFX_VERSION_PUBLISH_CACHE", "AVANTIQO_VFX_VERSION_PUBLISH_CACHE_V1"],
  ["ADVANCED_DELIVERY", "AVANTIQO_ADVANCED_DELIVERY_PACKAGE_V1"],
]);

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function hash(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function evaluateEliteVideoStudioReadiness({ evidence = [] } = {}) {
  const bySystem = new Map(list(evidence).map((item) => [text(item.system_id).toUpperCase(), item]));
  const systems = SYSTEMS.map(([id, contract]) => {
    const item = bySystem.get(id) || {};
    const implemented = item.implemented === true &&
      list(item.implementation_contracts).map(text).includes(contract);
    const certified = implemented &&
      item.technical_proof_passed === true &&
      (item.visual_proof_required !== true || item.visual_proof_passed === true);
    const blockers = [];
    if (!implemented) blockers.push("IMPLEMENTATION_CONTRACT_REQUIRED");
    if (implemented && item.technical_proof_passed !== true) blockers.push("TECHNICAL_PROOF_REQUIRED");
    if (item.visual_proof_required === true && item.visual_proof_passed !== true) {
      blockers.push("VISUAL_PROOF_REQUIRED");
    }
    return { id, contract, implemented, certified, blockers, evidence: item };
  });
  const body = {
    contract: AVANTIQO_ELITE_VIDEO_STUDIO_READINESS_CONTRACT,
    benchmark_class: "ELITE_AUTOMOTIVE_COMMERCIAL_STUDIO",
    systems,
    implemented: systems.every((item) => item.implemented),
    certified: systems.every((item) => item.certified),
    blocked_system_ids: systems.filter((item) => !item.certified).map((item) => item.id),
    policy: {
      benchmark_is_quality_pipeline_only: true,
      brand_affiliation_not_claimed: true,
      implementation_does_not_equal_certification: true,
      technical_proof_required_per_system: true,
      visual_proof_required_when_declared_by_system: true,
      no_audio_engine_duplication: true,
      audio_studio_remains_canonical_audio_authority: true,
    },
  };
  return {
    ...body,
    status: body.certified ? "ELITE_STUDIO_CERTIFIED" :
      body.implemented ? "IMPLEMENTED_AWAITING_PROOF" : "BLOCKED",
    readiness_hash: hash(body),
  };
}

export const CreativeEliteVideoStudioReadinessRuntime = Object.freeze({
  contract: AVANTIQO_ELITE_VIDEO_STUDIO_READINESS_CONTRACT,
  systems: SYSTEMS,
  evaluate: evaluateEliteVideoStudioReadiness,
});
