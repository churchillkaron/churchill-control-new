import { assessMusicSourceReadiness } from "./CreativeMusicSourceReadinessRuntime.js";
import { selectMusicSeparator } from "./CreativeMusicSeparatorSelectionRuntime.js";
import { buildMusicRestorationPlan } from "./CreativeMusicRestorationPlanRuntime.js";
import { buildMusicFoleyPlan } from "./CreativeMusicFoleyPlanRuntime.js";
import { buildMusicTransformationIntegrityContract } from "./CreativeMusicTransformationIntegrityRuntime.js";

const CONTRACT = "AVANTIQO_MUSIC_CAPABILITY_READINESS_V2";

const HARDENED = new Set([
  "stem_separation", "remove_vocals", "isolate_vocals", "backing_track",
  "vocal_role_separation", "singing_voice_identity", "remix", "ai_edit", "extend",
  "pitch_tuning", "timing_correction", "audio_cleanup", "sfx", "foley", "quality_review",
]);

const ENGINE_READY_STATUSES = new Set(["CERTIFIED", "IMPLEMENTED", "FOUNDATION_READY"]);

function detailFor(id, source = {}) {
  if (["stem_separation", "remove_vocals", "isolate_vocals", "backing_track", "vocal_role_separation"].includes(id)) {
    return {
      separator_selection: selectMusicSeparator({
        objective: id,
        benchmark_results: source.benchmark_results || [],
        certified_models: source.certified_models || [],
        source_kind: source.source_kind || "UNKNOWN",
      }),
    };
  }
  if (id === "audio_cleanup") {
    return { restoration_plan: buildMusicRestorationPlan(source.diagnostics || source) };
  }
  if (id === "foley") {
    return {
      foley_plan: buildMusicFoleyPlan({
        cues: source.cues || [],
        picture_duration_seconds: source.picture_duration_seconds ?? null,
        frame_rate: source.frame_rate ?? null,
      }),
    };
  }
  if (["remix", "ai_edit", "extend"].includes(id) && source.source_asset_id) {
    return {
      transformation_integrity: buildMusicTransformationIntegrityContract({
        operation: id,
        source_asset_id: source.source_asset_id,
        source_checksum: source.source_checksum || null,
        target_range: source.target_range || null,
        source_duration_seconds: source.source_duration_seconds ?? null,
      }),
    };
  }
  return {};
}

export function buildMusicCapabilityReadiness({ selected_capabilities = [], source_evidence = {} } = {}) {
  const capabilities = selected_capabilities.map((entry) => {
    const id = typeof entry === "string" ? entry : entry?.id;
    const declaredStatus = typeof entry === "string" ? null : entry?.status || null;
    if (!id) return null;
    const source = source_evidence?.[id] || source_evidence?.default || {};
    const preflight = HARDENED.has(id)
      ? assessMusicSourceReadiness({ ...source, operation: id })
      : null;
    const engineBlocked = declaredStatus ? !ENGINE_READY_STATUSES.has(declaredStatus) : false;
    const detail = detailFor(id, source);
    const detailBlockers = [
      ...(detail.separator_selection?.executable === false ? detail.separator_selection.blockers || [] : []),
      ...(detail.restoration_plan?.blockers || []),
    ];
    const blockers = [
      ...(engineBlocked ? [`CAPABILITY_STATUS_${declaredStatus}`] : []),
      ...(preflight?.blockers || []),
      ...detailBlockers,
    ];
    return {
      id,
      declared_status: declaredStatus,
      hardened_preflight: preflight,
      ...detail,
      engine_or_certification_gate_present: engineBlocked,
      source_fit_passed: preflight ? preflight.executable : true,
      paid_execution_allowed: blockers.length === 0,
      blockers: [...new Set(blockers)],
    };
  }).filter(Boolean);
  return {
    contract: CONTRACT,
    capabilities,
    all_source_fit_passed: capabilities.every((item) => item.source_fit_passed),
    all_execution_ready: capabilities.every((item) => item.paid_execution_allowed),
    blocked_capabilities: capabilities.filter((item) => item.blockers.length > 0),
  };
}

export const CreativeMusicCapabilityReadinessRuntime = Object.freeze({
  contract: CONTRACT,
  build: buildMusicCapabilityReadiness,
});
