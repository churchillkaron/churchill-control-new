import { scheduleMusicMixerAutomation } from "./MusicAutomationPreviewRuntime";
import { createMusicGroupBusPreviewGraph } from "./MusicGroupBusPreviewGraph";
import { createMusicMasterBusPreviewGraph } from "./MusicMasterBusPreviewGraph";
import { resolveMusicTrackPreviewClips } from "./MusicMultitrackPreviewEngine";
import { analyseMusicAudioBuffer, encodeMusicAudioBufferWav24 } from "./MusicWav24Runtime";

const DYNAMICS_MODULE = "/audio/avantiqo-music-dynamics-worklet.js";
const DECODE_CACHE = new Map();

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function dbToGain(db) {
  return 10 ** (finite(db, 0) / 20);
}

function enabledInsert(track, type) {
  return (track?.inserts || []).find((insert) => insert.type === type && insert.enabled !== false && insert.bypass !== true) || null;
}

function needsDynamicsWorklet(session) {
  return (session?.tracks || []).some((track) => enabledInsert(track, "gate") || enabledInsert(track, "deesser"));
}

async function decodeSource(context, url) {
  if (!url) throw new Error("CREATIVE_MUSIC_OFFLINE_SOURCE_URL_REQUIRED");
  if (DECODE_CACHE.has(url)) return DECODE_CACHE.get(url);
  const promise = fetch(url, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`CREATIVE_MUSIC_OFFLINE_SOURCE_FETCH_${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => context.decodeAudioData(bytes.slice(0)));
  DECODE_CACHE.set(url, promise);
  try {
    return await promise;
  } catch (error) {
    DECODE_CACHE.delete(url);
    throw error;
  }
}

function createWorkletInsert(context, name, insert) {
  const WorkletNode = globalThis.AudioWorkletNode;
  if (typeof WorkletNode !== "function") throw new Error("CREATIVE_MUSIC_OFFLINE_AUDIO_WORKLET_NODE_UNAVAILABLE");
  const node = new WorkletNode(context, name, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: insert?.parameters || {},
  });
  node.channelCountMode = "max";
  return node;
}

function saturationCurve(driveDb) {
  const samples = 2048;
  const curve = new Float32Array(samples);
  const drive = Math.max(1, dbToGain(Math.max(0, finite(driveDb, 3))));
  const normalization = Math.tanh(drive) || 1;
  for (let index = 0; index < samples; index += 1) {
    const x = (index / (samples - 1)) * 2 - 1;
    curve[index] = Math.tanh(x * drive) / normalization;
  }
  return curve;
}

function connectSaturation(context, input, insert) {
  const parameters = insert?.parameters || {};
  const mix = Math.max(0, Math.min(1, finite(parameters.mix, 0.18)));
  const dry = context.createGain(); dry.gain.value = 1 - mix;
  const shaper = context.createWaveShaper(); shaper.curve = saturationCurve(parameters.drive_db); shaper.oversample = "4x";
  const wet = context.createGain(); wet.gain.value = mix;
  const output = context.createGain(); output.gain.value = dbToGain(parameters.output_db);
  input.connect(dry); input.connect(shaper); shaper.connect(wet); dry.connect(output); wet.connect(output);
  return output;
}

function browserFilterType(type) {
  if (type === "bell") return "peaking";
  if (type === "lowshelf") return "lowshelf";
  if (type === "highshelf") return "highshelf";
  if (type === "notch") return "notch";
  if (type === "highpass") return "highpass";
  if (type === "lowpass") return "lowpass";
  return null;
}

function connectParametricEq(context, input, track) {
  const bands = Array.isArray(track?.channel_strip?.eq_bands) ? track.channel_strip.eq_bands.filter((band) => band.enabled !== false) : [];
  let chain = input;
  for (const band of bands) {
    const type = browserFilterType(String(band.type || "bell").toLowerCase());
    if (!type) continue;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = Math.max(20, Math.min(20000, finite(band.frequency_hz, 1000)));
    filter.Q.value = Math.max(0.1, Math.min(18, finite(band.q, 1)));
    if (!["notch", "highpass", "lowpass"].includes(String(band.type || "").toLowerCase())) filter.gain.value = Math.max(-18, Math.min(18, finite(band.gain_db, 0)));
    chain.connect(filter); chain = filter;
  }
  return chain;
}

function connectSourceCleanup(context, input, track) {
  const cleanup = track?.source_cleanup || {};
  if (cleanup.enabled === false) return input;
  let chain = input;
  if (cleanup.dc_blocker?.enabled === true) {
    const blocker = context.createBiquadFilter(); blocker.type = "highpass";
    blocker.frequency.value = Math.max(5, Math.min(35, finite(cleanup.dc_blocker.cutoff_hz, 15))); blocker.Q.value = 0.707;
    chain.connect(blocker); chain = blocker;
  }
  if (cleanup.hum_notch?.enabled === true) {
    const base = Number(cleanup.hum_notch.frequency_hz) === 60 ? 60 : 50;
    const q = Math.max(4, Math.min(40, finite(cleanup.hum_notch.q, 18)));
    const harmonics = Math.max(1, Math.min(4, Math.round(finite(cleanup.hum_notch.harmonics, 3))));
    for (let harmonic = 1; harmonic <= harmonics; harmonic += 1) {
      const frequency = base * harmonic;
      if (frequency >= context.sampleRate / 2) break;
      const notch = context.createBiquadFilter(); notch.type = "notch"; notch.frequency.value = frequency; notch.Q.value = q;
      chain.connect(notch); chain = notch;
    }
  }
  return chain;
}

function deterministicNoise(seed) {
  let value = seed >>> 0;
  return () => { value = (1664525 * value + 1013904223) >>> 0; return (value / 0xffffffff) * 2 - 1; };
}

function createReverbImpulse(context, decaySeconds) {
  const duration = Math.max(0.1, Math.min(12, finite(decaySeconds, 2.2)));
  const frames = Math.max(1, Math.round(context.sampleRate * duration));
  const buffer = context.createBuffer(2, frames, context.sampleRate);
  const leftNoise = deterministicNoise(0x41564e54); const rightNoise = deterministicNoise(0x49514f52);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel); const noise = channel === 0 ? leftNoise : rightNoise;
    for (let frame = 0; frame < frames; frame += 1) data[frame] = noise() * ((1 - frame / frames) ** 2.4);
  }
  return buffer;
}

function createReverbBus(context, bus, destination) {
  const parameters = bus?.parameters || {};
  const input = context.createGain();
  const preDelay = context.createDelay(0.3); preDelay.delayTime.value = Math.max(0, Math.min(0.25, finite(parameters.pre_delay_ms, 18) / 1000));
  const damping = context.createBiquadFilter(); damping.type = "lowpass"; damping.frequency.value = Math.max(1000, Math.min(20000, finite(parameters.damping_hz, 8500)));
  const convolver = context.createConvolver(); convolver.buffer = createReverbImpulse(context, parameters.decay_seconds);
  const wet = context.createGain(); wet.gain.value = bus?.mute === true ? 0 : dbToGain(finite(parameters.wet_db, -3) + finite(bus?.gain_db, 0));
  input.connect(preDelay); preDelay.connect(damping); damping.connect(convolver); convolver.connect(wet); wet.connect(destination);
  return input;
}

function createDelayBus(context, bus, destination) {
  const parameters = bus?.parameters || {};
  const input = context.createGain();
  const lowCut = context.createBiquadFilter(); lowCut.type = "highpass"; lowCut.frequency.value = Math.max(20, Math.min(1000, finite(parameters.low_cut_hz, 180)));
  const delay = context.createDelay(2.1); delay.delayTime.value = Math.max(0.01, Math.min(2, finite(parameters.time_seconds, 0.375)));
  const highCut = context.createBiquadFilter(); highCut.type = "lowpass"; highCut.frequency.value = Math.max(1000, Math.min(20000, finite(parameters.high_cut_hz, 7000)));
  const feedback = context.createGain(); feedback.gain.value = Math.max(0, Math.min(0.92, finite(parameters.feedback, 0.28)));
  const wet = context.createGain(); wet.gain.value = bus?.mute === true ? 0 : dbToGain(finite(parameters.wet_db, -6) + finite(bus?.gain_db, 0));
  input.connect(lowCut); lowCut.connect(delay); delay.connect(highCut); highCut.connect(wet); highCut.connect(feedback); feedback.connect(delay); wet.connect(destination);
  return input;
}

function createAuxBuses(context, session, masterInput) {
  const result = new Map();
  for (const bus of (session?.buses || []).filter((entry) => entry.type === "aux")) {
    const type = String(bus.effect_type || "").toLowerCase();
    if (type === "reverb") result.set(bus.id, createReverbBus(context, bus, masterInput));
    if (type === "delay") result.set(bus.id, createDelayBus(context, bus, masterInput));
  }
  return result;
}

function connectTrackStrip(context, track, destination, auxInputs) {
  const strip = track.channel_strip || {};
  const clipBus = context.createGain();
  let chain = connectSourceCleanup(context, clipBus, track);
  const trim = context.createGain(); trim.gain.value = dbToGain(strip.input_trim_db); chain.connect(trim);
  const polarity = context.createGain(); polarity.gain.value = strip.polarity_invert === true ? -1 : 1; trim.connect(polarity); chain = polarity;
  const gate = enabledInsert(track, "gate"); if (gate) { const node = createWorkletInsert(context, "avantiqo-music-gate", gate); chain.connect(node); chain = node; }
  const highPass = context.createBiquadFilter(); highPass.type = "highpass"; highPass.frequency.value = Math.max(20, finite(strip.high_pass_hz, 20)); highPass.Q.value = 0.707;
  const lowShelf = context.createBiquadFilter(); lowShelf.type = "lowshelf"; lowShelf.frequency.value = 120; lowShelf.gain.value = finite(strip.low_shelf_db, 0);
  const presence = context.createBiquadFilter(); presence.type = "peaking"; presence.frequency.value = 3200; presence.Q.value = 0.8; presence.gain.value = finite(strip.presence_db, 0);
  const highShelf = context.createBiquadFilter(); highShelf.type = "highshelf"; highShelf.frequency.value = 8000; highShelf.gain.value = finite(strip.high_shelf_db, 0);
  chain.connect(highPass); highPass.connect(lowShelf); lowShelf.connect(presence); presence.connect(highShelf); chain = connectParametricEq(context, highShelf, track);
  const deesser = enabledInsert(track, "deesser"); if (deesser) { const node = createWorkletInsert(context, "avantiqo-music-deesser", deesser); chain.connect(node); chain = node; }
  const saturation = enabledInsert(track, "saturation"); if (saturation) chain = connectSaturation(context, chain, saturation);
  const compressorSettings = strip.compressor || {};
  if (compressorSettings.enabled === true) {
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = finite(compressorSettings.threshold_db, -18); compressor.ratio.value = Math.max(1, finite(compressorSettings.ratio, 3));
    compressor.attack.value = Math.max(0.0001, finite(compressorSettings.attack_ms, 15) / 1000); compressor.release.value = Math.max(0.01, finite(compressorSettings.release_ms, 150) / 1000); compressor.knee.value = Math.max(0, finite(compressorSettings.knee_db, 6));
    chain.connect(compressor); chain = compressor;
  }
  const makeup = context.createGain(); makeup.gain.value = compressorSettings.enabled === true ? dbToGain(compressorSettings.makeup_db) : 1; chain.connect(makeup);
  const fader = context.createGain(); fader.gain.value = track.mute === true ? 0 : dbToGain(track.gain_db); makeup.connect(fader);
  const pan = context.createStereoPanner(); pan.pan.value = Math.max(-1, Math.min(1, finite(track.pan, 0))); fader.connect(pan); pan.connect(destination);
  if (track.mute !== true) {
    for (const send of track.sends || []) {
      if (send.enabled === false) continue;
      const aux = auxInputs.get(send.bus_id); if (!aux) continue;
      const sendGain = context.createGain(); sendGain.gain.value = dbToGain(finite(send.level_db, -18));
      (send.pre_fader === true ? makeup : pan).connect(sendGain); sendGain.connect(aux);
    }
  }
  return { clipBus, fader, pan };
}

function scheduleClip(context, buffer, clip, destination) {
  if (clip.muted === true || clip.reversed === true || clip.loop_enabled === true || (clip.warp_mode && clip.warp_mode !== "off")) {
    if (clip.muted === true) return;
    throw new Error(`CREATIVE_MUSIC_OFFLINE_CLIP_MODE_UNSUPPORTED:${clip.id || "unknown"}`);
  }
  const sourceOffset = Math.max(0, finite(clip.source_offset_seconds, 0));
  const duration = Math.min(Math.max(0, finite(clip.duration_seconds, 0)), Math.max(0, buffer.duration - sourceOffset));
  if (duration <= 0) return;
  const source = context.createBufferSource(); source.buffer = buffer;
  const gain = context.createGain(); const baseGain = dbToGain(clip.gain_db); gain.gain.value = baseGain;
  source.connect(gain); gain.connect(destination);
  const when = Math.max(0, finite(clip.start_seconds, 0));
  const fadeIn = Math.min(duration / 2, Math.max(0, finite(clip.fade_in_seconds, 0)));
  const fadeOut = Math.min(duration / 2, Math.max(0, finite(clip.fade_out_seconds, 0)));
  if (fadeIn > 0) { gain.gain.setValueAtTime(0, when); gain.gain.linearRampToValueAtTime(baseGain, when + fadeIn); }
  if (fadeOut > 0) { gain.gain.setValueAtTime(baseGain, when + Math.max(0, duration - fadeOut)); gain.gain.linearRampToValueAtTime(0, when + duration); }
  source.start(when, sourceOffset, duration);
}

function renderTailSeconds(session) {
  const reverb = (session.buses || []).find((bus) => bus.type === "aux" && bus.effect_type === "reverb");
  const delay = (session.buses || []).find((bus) => bus.type === "aux" && bus.effect_type === "delay");
  const reverbTail = reverb ? Math.max(0, Math.min(12, finite(reverb.parameters?.decay_seconds, 2.2) + finite(reverb.parameters?.pre_delay_ms, 18) / 1000)) : 0;
  const delayTime = delay ? Math.max(0.01, Math.min(2, finite(delay.parameters?.time_seconds, 0.375))) : 0;
  const feedback = delay ? Math.max(0, Math.min(0.92, finite(delay.parameters?.feedback, 0.28))) : 0;
  const delayTail = feedback > 0 ? Math.min(12, delayTime * Math.max(1, Math.ceil(Math.log(0.001) / Math.log(feedback)))) : delayTime;
  return Math.max(0.25, reverbTail, delayTail);
}

export async function renderMusicMultitrackOffline({ session, assetUrls, expectedDurationSeconds = null } = {}) {
  if (!session) throw new Error("CREATIVE_MUSIC_OFFLINE_SESSION_REQUIRED");
  const OfflineContext = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!OfflineContext) throw new Error("CREATIVE_MUSIC_OFFLINE_AUDIO_CONTEXT_UNAVAILABLE");
  const clipEnd = Math.max(0, ...(session.tracks || []).flatMap((track) => resolveMusicTrackPreviewClips(track).filter((clip) => clip.muted !== true).map((clip) => finite(clip.start_seconds, 0) + finite(clip.duration_seconds, 0))));
  const programDuration = Number.isFinite(expectedDurationSeconds) ? Math.max(clipEnd, expectedDurationSeconds) : clipEnd;
  if (programDuration <= 0) throw new Error("CREATIVE_MUSIC_OFFLINE_DURATION_REQUIRED");
  const sampleRate = Math.max(8000, Math.min(192000, Math.round(finite(session.sample_rate, 48000))));
  const tailSeconds = renderTailSeconds(session);
  const frameCount = Math.max(1, Math.ceil((programDuration + tailSeconds) * sampleRate));
  const context = new OfflineContext(2, frameCount, sampleRate);
  const dynamicsRequired = needsDynamicsWorklet(session);
  if (dynamicsRequired) {
    if (!context.audioWorklet?.addModule || typeof globalThis.AudioWorkletNode !== "function") throw new Error("CREATIVE_MUSIC_OFFLINE_DYNAMICS_WORKLET_UNAVAILABLE");
    await context.audioWorklet.addModule(DYNAMICS_MODULE);
  }

  const prepared = [];
  for (const track of session.tracks || []) {
    const clips = [];
    for (const clip of resolveMusicTrackPreviewClips(track)) {
      const url = assetUrls?.[clip.source_asset_id];
      if (!url) throw new Error(`CREATIVE_MUSIC_OFFLINE_SOURCE_URL_MISSING:${clip.source_asset_id}`);
      clips.push({ clip, buffer: await decodeSource(context, url) });
    }
    prepared.push({ track, clips });
  }

  const masterBus = session.buses?.find((bus) => bus.id === "bus-master") || {};
  const masterGraph = createMusicMasterBusPreviewGraph(context, masterBus, context.destination);
  const groupGraph = createMusicGroupBusPreviewGraph(context, session, masterGraph.input);
  const auxInputs = createAuxBuses(context, session, masterGraph.input);
  const automationTargets = new Map();
  if (masterBus.mute !== true) automationTargets.set("master:bus-master:gain_db", masterGraph.fader.gain);
  for (const [groupId, nodes] of groupGraph.outputs) {
    if (nodes.bus.mute !== true) automationTargets.set(`group:${groupId}:gain_db`, nodes.fader.gain);
    automationTargets.set(`group:${groupId}:pan`, nodes.pan.pan);
  }
  const soloActive = (session.tracks || []).some((track) => track.solo === true);
  for (const item of prepared) {
    const effectiveMute = item.track.mute === true || (soloActive && item.track.solo !== true);
    const track = effectiveMute ? { ...item.track, mute: true } : item.track;
    const nodes = connectTrackStrip(context, track, groupGraph.destinationForTrack(item.track), auxInputs);
    if (!effectiveMute) automationTargets.set(`track:${item.track.id}:gain_db`, nodes.fader.gain);
    automationTargets.set(`track:${item.track.id}:pan`, nodes.pan.pan);
    for (const entry of item.clips) scheduleClip(context, entry.buffer, entry.clip, nodes.clipBus);
  }

  const automation = scheduleMusicMixerAutomation({ session, targets: automationTargets, startSeconds: 0, stopAtSeconds: programDuration, contextStartTime: 0 });
  const audioBuffer = await context.startRendering();
  const levels = analyseMusicAudioBuffer(audioBuffer);
  const wav = encodeMusicAudioBufferWav24(audioBuffer);
  return {
    contract: "AVANTIQO_MUSIC_OFFLINE_MIX_RENDER_V1",
    renderer: "AVANTIQO_MUSIC_OFFLINE_AUDIO_RENDERER_V1",
    audio_buffer: audioBuffer,
    blob: wav.blob,
    sample_rate: wav.sample_rate,
    channels: wav.channels,
    bit_depth: wav.bit_depth,
    program_duration_seconds: programDuration,
    render_duration_seconds: wav.duration_seconds,
    tail_seconds: tailSeconds,
    levels,
    automation: { ...automation, release_render: true },
    group_bus_count: groupGraph.group_count,
    aux_send_aware: true,
    nested_group_bus_routing: true,
    group_bus_processing: true,
    master_bus_processing: true,
    release_limiter_applied: false,
    true_peak_certified: false,
    destructive_processing: false,
    original_assets_preserved: true,
  };
}

export function clearMusicOfflineRenderCache() {
  DECODE_CACHE.clear();
}
