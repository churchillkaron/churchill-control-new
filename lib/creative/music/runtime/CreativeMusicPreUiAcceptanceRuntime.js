const CONTRACT = "AVANTIQO_MUSIC_PRE_UI_ACCEPTANCE_V1";

function text(value) { return String(value ?? "").trim(); }
function row(id, status, reason, extra = {}) { return { id, status, ready: status === "READY", reason, ...extra }; }

export function buildMusicPreUiAcceptance({ provider = {}, capabilities = {}, defer_singing_identity = true } = {}) {
  const meta = provider?.metadata || {};
  const separator = meta.separator_runtime || {};
  const sfx = meta.sfx_runtime || {};
  const vocalCorrection = meta.vocal_correction_runtime || {};
  const elastic = meta.elastic_audio_runtime || {};
  const certified = new Set(Array.isArray(provider?.capabilities) ? provider.capabilities : []);
  const matrix = [
    row("compose_song", certified.has("ai.music.generate") ? "READY" : "BLOCKED", certified.has("ai.music.generate") ? "OWNED_MUSIC_GENERATION_CERTIFIED" : "MUSIC_GENERATION_NOT_CERTIFIED"),
    row("instrumental", certified.has("ai.music.generate") ? "READY" : "BLOCKED", certified.has("ai.music.generate") ? "OWNED_MUSIC_GENERATION_CERTIFIED" : "MUSIC_GENERATION_NOT_CERTIFIED"),
    row("stem_separation", separator.production_routing_allowed === true && certified.has("ai.audio.stems") ? "READY" : "BLOCKED", separator.production_routing_allowed === true ? "SEPARATOR_CERTIFIED" : "SEPARATOR_CERTIFICATION_REQUIRED"),
    row("remove_vocals", separator.production_routing_allowed === true && certified.has("ai.audio.stems") ? "READY" : "BLOCKED", separator.production_routing_allowed === true ? "SEPARATOR_CERTIFIED" : "SEPARATOR_CERTIFICATION_REQUIRED"),
    row("backing_track", separator.production_routing_allowed === true && certified.has("ai.audio.stems") ? "READY" : "BLOCKED", separator.production_routing_allowed === true ? "SEPARATOR_CERTIFIED" : "SEPARATOR_CERTIFICATION_REQUIRED"),
    row("record_import", "READY", "LOCAL_MULTITRACK_IMPLEMENTED"),
    row("mix", "READY", "LOCAL_MIX_RUNTIME_IMPLEMENTED"),
    row("master", "READY", "AUDIO_FINISHING_IMPLEMENTED"),
    row("cleanup", "READY", "DIAGNOSTICS_FIRST_RESTORATION_IMPLEMENTED"),
    row("edit_section", certified.has("ai.audio.edit") ? "READY" : "BLOCKED", certified.has("ai.audio.edit") ? "EDIT_BENCHMARK_CERTIFIED" : "EDIT_BENCHMARK_REQUIRED"),
    row("remix", certified.has("ai.audio.remix") ? "READY" : "BLOCKED", certified.has("ai.audio.remix") ? "REMIX_BENCHMARK_CERTIFIED" : "REMIX_BENCHMARK_REQUIRED"),
    row("extend", certified.has("ai.audio.extend") ? "READY" : "BLOCKED", certified.has("ai.audio.extend") ? "EXTEND_BENCHMARK_CERTIFIED" : "EXTEND_BENCHMARK_REQUIRED"),
    row("pitch_tuning", vocalCorrection.production_routing_allowed === true ? "READY" : "BLOCKED", vocalCorrection.production_routing_allowed === true ? "VOCAL_CORRECTION_CERTIFIED" : "VOCAL_CORRECTION_CERTIFICATION_REQUIRED"),
    row("timing_correction", (vocalCorrection.production_routing_allowed === true || elastic.production_routing_allowed === true) ? "READY" : "BLOCKED", (vocalCorrection.production_routing_allowed === true || elastic.production_routing_allowed === true) ? "TIMING_ENGINE_CERTIFIED" : "TIMING_ENGINE_CERTIFICATION_REQUIRED"),
    row("sfx", sfx.production_routing_allowed === true && certified.has("ai.sfx.generate") ? "READY" : "BLOCKED", sfx.production_routing_allowed === true ? "SFX_CERTIFIED" : "SFX_CERTIFICATION_REQUIRED"),
    row("foley", "READY", "LOCAL_FOLEY_RECORD_IMPORT_AND_PICTURE_SYNC_IMPLEMENTED", { ai_generated_foley_requires_sfx_certification: true }),
    row("audio_for_video", "READY", "TIMELINE_AUDIO_IMPLEMENTED"),
    row("release_package", "READY", "RELEASE_RENDER_AND_TRIBUNAL_IMPLEMENTED"),
    row("business_partner_to_studio", "READY", "BUSINESS_PARTNER_MUSIC_ROUTING_IMPLEMENTED"),
    row("singing_voice_identity", defer_singing_identity ? "DEFERRED" : "BLOCKED", defer_singing_identity ? "CLEAN_AUTHORIZED_REFERENCE_PENDING" : "SINGING_IDENTITY_CERTIFICATION_REQUIRED"),
  ];
  const blocking = matrix.filter((item) => item.status === "BLOCKED");
  const deferred = matrix.filter((item) => item.status === "DEFERRED");
  return {
    contract: CONTRACT,
    matrix,
    blocking_workflows: blocking.map((item) => item.id),
    deferred_workflows: deferred.map((item) => item.id),
    ui_ready: blocking.length === 0,
    ui_can_begin_with_disabled_gated_controls: true,
    provider: text(provider?.id) || "avantiqo-audio",
    production_deployment_authorized: false,
  };
}

export const CreativeMusicPreUiAcceptanceRuntime = Object.freeze({ contract: CONTRACT, build: buildMusicPreUiAcceptance });
