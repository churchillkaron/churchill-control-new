const CONTRACT = "AVANTIQO_MUSIC_RESTORATION_PLAN_V1";

function finite(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function bool(value) { return value === true; }

export function buildMusicRestorationPlan(diagnostics = {}) {
  const defects = [];
  const local = [];
  const gated = [];
  if (Math.abs(finite(diagnostics.dc_offset, 0)) > 0.01 || bool(diagnostics.dc_offset_warning)) {
    defects.push("DC_OFFSET"); local.push("DC_BLOCK");
  }
  if (bool(diagnostics.hum_warning) || finite(diagnostics.dominant_hum_relative_db, -120) > -24) {
    defects.push("MAINS_HUM"); local.push("NOTCH_HUM_AND_HARMONICS");
  }
  if (bool(diagnostics.clicks_detected)) { defects.push("CLICKS"); local.push("DECLICK_CONSERVATIVE"); }
  if (bool(diagnostics.sibilance_warning)) { defects.push("SIBILANCE"); local.push("DEESS_CONSERVATIVE"); }
  if (bool(diagnostics.noise_warning)) { defects.push("BROADBAND_NOISE"); local.push("DENOISE_CONSERVATIVE"); }
  if (bool(diagnostics.clipping_detected)) { defects.push("CLIPPING"); gated.push("DECLIP_ENGINE"); }
  if (bool(diagnostics.excess_reverb_detected)) { defects.push("EXCESS_REVERB"); gated.push("DEREVERB_ENGINE"); }
  if (bool(diagnostics.bleed_detected)) { defects.push("BLEED"); gated.push("DEBLEED_ENGINE"); }
  if (bool(diagnostics.plosive_detected)) { defects.push("PLOSIVE"); gated.push("SPECTRAL_REPAIR_ENGINE"); }

  return {
    contract: CONTRACT,
    diagnostics_required: true,
    defects,
    no_op: defects.length === 0,
    local_processors: local,
    certified_engine_processors: gated,
    executable_locally: gated.length === 0,
    blockers: gated.map((item) => `CERTIFIED_${item}_REQUIRED`),
    preserve_original_source: true,
    render_new_asset_only: true,
    auto_apply_forbidden: true,
    bypass_unneeded_processors: true,
  };
}

export const CreativeMusicRestorationPlanRuntime = Object.freeze({
  contract: CONTRACT,
  build: buildMusicRestorationPlan,
});
