import { selectMusicSamplerLayer } from "@/lib/creative/music/runtime/CreativeMusicSamplerRuntime";

const ENGINE_CONTRACT = "AVANTIQO_MUSIC_BROWSER_SAMPLER_ENGINE_V2";

function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function clamp(value, min, max, fallback = min) { return Math.max(min, Math.min(max, finite(value, fallback))); }
function gainFromDb(db) { return 10 ** (clamp(db, -60, 24, 0) / 20); }

function reversedBuffer(context, source) {
  const target = context.createBuffer(source.numberOfChannels, source.length, source.sampleRate);
  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    const input = source.getChannelData(channel);
    const output = target.getChannelData(channel);
    for (let index = 0; index < input.length; index += 1) output[index] = input[input.length - 1 - index];
  }
  return target;
}

async function decodeSample(context, url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`MUSIC_SAMPLER_SAMPLE_FETCH_FAILED:${response.status}`);
  const bytes = await response.arrayBuffer();
  return context.decodeAudioData(bytes.slice(0));
}

function requiredAssetIds(kit = {}) {
  return [...new Set((kit.pads || []).flatMap((pad) => [
    pad.sample_asset_id,
    ...(pad.layers || []).map((layer) => layer.sample_asset_id),
  ]).filter(Boolean))];
}

export async function startMusicSamplerPreview({
  kit,
  notes = [],
  sampleUrls = {},
  bpm = 120,
  startBeat = 0,
  masterGainDb = null,
  onEnded,
} = {}) {
  if (!kit || !Array.isArray(kit.pads)) throw new Error("MUSIC_SAMPLER_KIT_REQUIRED");
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) throw new Error("MUSIC_SAMPLER_WEB_AUDIO_UNAVAILABLE");
  const context = new AudioContextClass({ latencyHint: "interactive" });
  await context.resume();
  const master = context.createGain();
  master.gain.value = gainFromDb(masterGainDb ?? kit.master_gain_db ?? 0) * 0.72;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -8;
  compressor.knee.value = 8;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.12;
  master.connect(compressor).connect(context.destination);

  const padsByPitch = new Map((kit.pads || []).map((pad) => [Math.round(finite(pad.midi_pitch, -1)), pad]));
  const buffers = new Map();
  await Promise.all(requiredAssetIds(kit).map(async (assetId) => {
    const url = sampleUrls[assetId];
    if (!url) return;
    buffers.set(assetId, await decodeSample(context, url));
  }));

  const secondsPerBeat = 60 / clamp(bpm, 30, 300, 120);
  const now = context.currentTime + 0.04;
  const sources = new Set();
  const chokeGroups = new Map();
  const roundRobinCounters = new Map();
  let lastEnd = now + 0.08;
  let scheduledHits = 0;
  let layeredHits = 0;
  let roundRobinHits = 0;

  for (const note of notes) {
    if (note.muted === true) continue;
    const noteStartBeat = finite(note.start_beat, 0);
    if (noteStartBeat < startBeat) continue;
    const pitch = Math.round(finite(note.pitch, -1));
    const pad = padsByPitch.get(pitch);
    if (!pad) continue;
    const counter = roundRobinCounters.get(pitch) || 0;
    const layer = selectMusicSamplerLayer(pad, note.velocity, counter);
    const assetId = layer?.sample_asset_id || pad.sample_asset_id;
    if (!assetId) continue;
    let buffer = buffers.get(assetId);
    if (!buffer) continue;
    const eligibleCount = (pad.layers || []).filter((candidate) => candidate.enabled !== false && candidate.sample_asset_id && candidate.velocity_min <= finite(note.velocity, 100) && candidate.velocity_max >= finite(note.velocity, 100)).length;
    if (layer) layeredHits += 1;
    if (eligibleCount > 1 && pad.round_robin_enabled !== false) roundRobinHits += 1;
    roundRobinCounters.set(pitch, counter + 1);
    if (pad.reverse === true) buffer = reversedBuffer(context, buffer);
    const when = now + (noteStartBeat - startBeat) * secondsPerBeat;
    const offset = clamp(pad.start_offset_seconds, 0, Math.max(0, buffer.duration - 0.001), 0);
    const configuredEnd = pad.end_offset_seconds === null || pad.end_offset_seconds === undefined
      ? buffer.duration
      : clamp(pad.end_offset_seconds, offset + 0.001, buffer.duration, buffer.duration);
    const sampleDuration = Math.max(0.001, configuredEnd - offset);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 2 ** ((clamp(pad.tune_semitones, -24, 24, 0) + clamp(layer?.tune_semitones, -24, 24, 0)) / 12);
    const gain = context.createGain();
    const velocity = clamp(note.velocity, 1, 127, 100) / 127;
    const velocityDepth = clamp(pad.velocity_to_gain, 0, 1, 1);
    const velocityScale = 1 - velocityDepth + velocity * velocityDepth;
    const peakGain = Math.max(0.0001, gainFromDb((pad.gain_db || 0) + (layer?.gain_db || 0)) * velocityScale);
    const attack = clamp(pad.attack_ms, 0, 5000, 0) / 1000;
    const release = clamp(pad.release_ms, 0, 10000, 80) / 1000;
    gain.gain.setValueAtTime(attack > 0 ? 0.0001 : peakGain, when);
    if (attack > 0) gain.gain.linearRampToValueAtTime(peakGain, when + attack);
    const pan = context.createStereoPanner();
    pan.pan.value = clamp(pad.pan, -1, 1, 0);
    source.connect(gain).connect(pan).connect(master);

    const chokeGroup = String(pad.choke_group || "").trim();
    if (chokeGroup) {
      const prior = chokeGroups.get(chokeGroup);
      if (prior) {
        try { prior.stop(when); } catch {}
      }
      chokeGroups.set(chokeGroup, source);
    }

    const naturalDuration = sampleDuration / source.playbackRate.value;
    const noteDuration = Math.max(0.001, finite(note.duration_beats, 0.25) * secondsPerBeat);
    const audibleDuration = pad.one_shot === false ? Math.min(naturalDuration, noteDuration) : naturalDuration;
    const releaseAt = when + Math.max(0.001, audibleDuration - release);
    if (release > 0) {
      gain.gain.setValueAtTime(peakGain, releaseAt);
      gain.gain.linearRampToValueAtTime(0.0001, releaseAt + release);
    }
    source.start(when, offset, sampleDuration);
    source.stop(when + audibleDuration + release + 0.02);
    source.onended = () => { sources.delete(source); };
    sources.add(source);
    scheduledHits += 1;
    lastEnd = Math.max(lastEnd, when + audibleDuration + release);
  }

  let closed = false;
  let timer = null;
  async function stop() {
    if (closed) return;
    closed = true;
    if (timer) clearTimeout(timer);
    for (const source of sources) {
      try { source.stop(); } catch {}
      try { source.disconnect(); } catch {}
    }
    try { master.disconnect(); } catch {}
    try { compressor.disconnect(); } catch {}
    try { await context.close(); } catch {}
  }

  timer = setTimeout(async () => {
    if (closed) return;
    await stop();
    onEnded?.();
  }, Math.max(80, (lastEnd - context.currentTime) * 1000 + 40));

  return {
    contract: ENGINE_CONTRACT,
    scheduled_hit_count: scheduledHits,
    layered_hit_count: layeredHits,
    round_robin_hit_count: roundRobinHits,
    loaded_sample_count: buffers.size,
    velocity_layers: true,
    round_robin: true,
    provider_job_submitted: false,
    source_assets_preserved: true,
    stop,
  };
}

export const MusicSamplerEngine = {
  contract: ENGINE_CONTRACT,
  velocityLayers: true,
  roundRobin: true,
  startPreview: startMusicSamplerPreview,
};
