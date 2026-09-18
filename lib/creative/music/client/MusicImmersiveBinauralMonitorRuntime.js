import { normalizeMusicImmersiveObject, immersivePositionFromAngles, dopplerPlaybackRate } from "../runtime/CreativeMusicImmersiveObjectRuntime.js";

const MATERIALS = Object.freeze({
  AIR: Object.freeze({ min_cutoff_hz: 18000, max_attenuation_db: 0 }),
  CURTAIN: Object.freeze({ min_cutoff_hz: 6500, max_attenuation_db: 5 }),
  GLASS: Object.freeze({ min_cutoff_hz: 5200, max_attenuation_db: 7 }),
  WOOD: Object.freeze({ min_cutoff_hz: 3200, max_attenuation_db: 10 }),
  VEHICLE_BODY: Object.freeze({ min_cutoff_hz: 2200, max_attenuation_db: 14 }),
  BRICK: Object.freeze({ min_cutoff_hz: 1500, max_attenuation_db: 18 }),
  CONCRETE: Object.freeze({ min_cutoff_hz: 1100, max_attenuation_db: 22 }),
  METAL: Object.freeze({ min_cutoff_hz: 900, max_attenuation_db: 24 }),
});
function finite(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, finite(v, a))); }
function dbToGain(db) { return 10 ** (finite(db, 0) / 20); }

export async function createMusicImmersiveBinauralMonitor({ url, spatial_path = {}, duration_seconds = null } = {}) {
  if (!url) throw new Error("CREATIVE_MUSIC_IMMERSIVE_PREVIEW_URL_REQUIRED");
  const C = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!C) throw new Error("CREATIVE_MUSIC_IMMERSIVE_AUDIO_CONTEXT_UNAVAILABLE");
  const context = new C();
  const element = new Audio();
  element.crossOrigin = "anonymous";
  element.preload = "auto";
  element.src = url;
  const source = context.createMediaElementSource(element);
  const panner = context.createPanner();
  const occlusionFilter = context.createBiquadFilter();
  const occlusionGain = context.createGain();
  const cfg = normalizeMusicImmersiveObject({
    ...spatial_path?.immersive,
    occlusion_percent: spatial_path.start_occlusion_percent ?? spatial_path?.immersive?.occlusion_percent,
    obstruction_material: spatial_path.obstruction_material ?? spatial_path?.immersive?.obstruction_material,
    reflection_amount_percent: spatial_path.start_reflection_amount_percent ?? spatial_path?.immersive?.reflection_amount_percent,
    azimuth_degrees: spatial_path.start_azimuth_degrees,
    elevation_degrees: spatial_path.start_elevation_degrees,
    distance_meters: spatial_path.start_distance_meters,
  });
  panner.panningModel = "HRTF";
  panner.distanceModel = cfg.distance_model;
  panner.refDistance = cfg.ref_distance_meters;
  panner.maxDistance = cfg.max_distance_meters;
  panner.rolloffFactor = cfg.rolloff_factor;
  occlusionFilter.type = "lowpass";
  occlusionFilter.frequency.value = 18000;
  occlusionGain.gain.value = 1;
  source.connect(panner);
  panner.connect(occlusionFilter);
  occlusionFilter.connect(occlusionGain);

  let destination = occlusionGain;
  let dry = null, wet = null, delay = null, feedback = null, sum = null;
  if (cfg.reflections_enabled) {
    dry = context.createGain(); wet = context.createGain(); delay = context.createDelay(.25); feedback = context.createGain(); sum = context.createGain();
    const mix = cfg.reflection_amount_percent / 100;
    dry.gain.value = 1 - mix; wet.gain.value = mix;
    delay.delayTime.value = .015 + .07 * cfg.room_size;
    feedback.gain.value = .15 + .55 * cfg.room_size;
    occlusionGain.disconnect();
    occlusionGain.connect(dry); occlusionGain.connect(delay); delay.connect(feedback); feedback.connect(delay); delay.connect(wet); dry.connect(sum); wet.connect(sum);
    destination = sum;
  }
  destination.connect(context.destination);

  let raf = 0, lastDistance = finite(spatial_path.start_distance_meters, 2), lastTime = 0, stopped = false;
  const nominal = Math.max(.01, finite(duration_seconds, 0) || 0);
  function tick() {
    if (stopped) return;
    const duration = nominal || element.duration || 1;
    const t = Math.max(0, Math.min(1, element.currentTime / duration));
    const az = lerp(finite(spatial_path.start_azimuth_degrees, 0), finite(spatial_path.end_azimuth_degrees, 0), t);
    const el = lerp(finite(spatial_path.start_elevation_degrees, 0), finite(spatial_path.end_elevation_degrees, 0), t);
    const distance = lerp(finite(spatial_path.start_distance_meters, 2), finite(spatial_path.end_distance_meters, 2), t);
    const occ = clamp(lerp(finite(spatial_path.start_occlusion_percent, cfg.occlusion_percent), finite(spatial_path.end_occlusion_percent, cfg.occlusion_percent), t), 0, 100) / 100;
    const material = MATERIALS[String(spatial_path.obstruction_material || cfg.obstruction_material || "AIR").toUpperCase()] || MATERIALS.AIR;
    const cutoff = 18000 + (material.min_cutoff_hz - 18000) * (occ * occ);
    const gain = dbToGain(-material.max_attenuation_db * occ);
    occlusionFilter.frequency.setTargetAtTime(cutoff, context.currentTime, .015);
    occlusionGain.gain.setTargetAtTime(gain, context.currentTime, .015);
    if (dry && wet) {
      const reflection = clamp(lerp(finite(spatial_path.start_reflection_amount_percent, cfg.reflection_amount_percent), finite(spatial_path.end_reflection_amount_percent, cfg.reflection_amount_percent), t), 0, 100) / 100;
      dry.gain.setTargetAtTime(1 - reflection, context.currentTime, .02);
      wet.gain.setTargetAtTime(reflection, context.currentTime, .02);
    }
    const pos = immersivePositionFromAngles({ azimuth_degrees: az, elevation_degrees: el, distance_meters: distance });
    const dt = Math.max(.001, element.currentTime - lastTime);
    panner.positionX.value = pos.x; panner.positionY.value = pos.y; panner.positionZ.value = pos.z;
    if (cfg.doppler_enabled && element.currentTime > 0) element.playbackRate = dopplerPlaybackRate({ source_velocity_mps: (distance - lastDistance) / dt, doppler_factor: cfg.doppler_factor });
    lastDistance = distance; lastTime = element.currentTime; raf = requestAnimationFrame(tick);
  }
  await context.resume(); await element.play(); raf = requestAnimationFrame(tick);
  const stop = async () => {
    if (stopped) return; stopped = true; if (raf) cancelAnimationFrame(raf); element.pause(); element.src = "";
    try { source.disconnect(); panner.disconnect(); occlusionFilter.disconnect(); occlusionGain.disconnect(); dry?.disconnect(); wet?.disconnect(); delay?.disconnect(); feedback?.disconnect(); sum?.disconnect(); destination.disconnect?.(); } catch {}
    await context.close().catch(() => {});
  };
  element.addEventListener("ended", () => { void stop(); }, { once: true });
  return { contract: "AVANTIQO_MUSIC_IMMERSIVE_BINAURAL_MONITOR_V2", stop, element, context, binaural: true, hrtf: true, doppler_enabled: cfg.doppler_enabled, reflections_enabled: cfg.reflections_enabled, occlusion_enabled: cfg.occlusion_enabled, obstruction_material: cfg.obstruction_material, dolby_branded: false };
}
export const MusicImmersiveBinauralMonitorRuntime = Object.freeze({ contract: "AVANTIQO_MUSIC_IMMERSIVE_BINAURAL_MONITOR_V2", create: createMusicImmersiveBinauralMonitor });
