const BUFFER_CACHE = new Map();
const METER_EVENT = "avantiqo:music-meter";
const STEREO_METER_MODULE = "/audio/avantiqo-music-stereo-meter-worklet.js";
const SOURCE_DIAGNOSTICS_MODULE = "/audio/avantiqo-music-source-diagnostics-worklet.js";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function dbToGain(db) {
  return 10 ** (finite(db, 0) / 20);
}

function amplitudeToDb(value) {
  if (!Number.isFinite(value) || value <= 0) return -Infinity;
  return 20 * Math.log10(value);
}

function analyserLevels(analyser, scratch) {
  analyser.getFloatTimeDomainData(scratch);
  let peak = 0;
  let sumSquares = 0;
  for (let index = 0; index < scratch.length; index += 1) {
    const sample = scratch[index];
    peak = Math.max(peak, Math.abs(sample));
    sumSquares += sample * sample;
  }
  return {
    peak_dbfs: amplitudeToDb(peak),
    rms_dbfs: amplitudeToDb(Math.sqrt(sumSquares / Math.max(1, scratch.length))),
    clipping: peak >= 0.999,
  };
}

function publishMeter(detail) {
  if (typeof globalThis.dispatchEvent !== "function" || typeof globalThis.CustomEvent !== "function") return;
  globalThis.dispatchEvent(new CustomEvent(METER_EVENT, { detail }));
}

function emptyStereoMeter() {
  return {
    correlation: null,
    left_rms_dbfs: -Infinity,
    right_rms_dbfs: -Infinity,
    left_peak_dbfs: -Infinity,
    right_peak_dbfs: -Infinity,
    balance_db: 0,
    mono_compatibility_warning: false,
    phase_risk: false,
  };
}

function emptySourceDiagnostics() {
  return {
    available: false,
    rms_dbfs: -Infinity,
    peak_dbfs: -Infinity,
    dc_offset: 0,
    dc_offset_dbfs: -Infinity,
    background_floor_estimate_dbfs: -Infinity,
    hum_50_relative_db: -Infinity,
    hum_60_relative_db: -Infinity,
    dominant_hum_hz: null,
    dominant_hum_relative_db: -Infinity,
    hum_warning: false,
    dc_offset_warning: false,
    floor_history_windows: 0,
    floor_is_estimate: true,
  };
}

function createStereoMeterNode(context, onMeter) {
  const node = new AudioWorkletNode(context, "avantiqo-music-stereo-meter", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
  node.channelCountMode = "max";
  node.port.onmessage = (event) => {
    if (event.data?.type !== "stereo_meter") return;
    onMeter?.({
      correlation: Math.max(-1, Math.min(1, finite(event.data.correlation, 1))),
      left_rms_dbfs: finite(event.data.left_rms_dbfs, -Infinity),
      right_rms_dbfs: finite(event.data.right_rms_dbfs, -Infinity),
      left_peak_dbfs: finite(event.data.left_peak_dbfs, -Infinity),
      right_peak_dbfs: finite(event.data.right_peak_dbfs, -Infinity),
      balance_db: finite(event.data.balance_db, 0),
      mono_compatibility_warning: event.data.mono_compatibility_warning === true,
      phase_risk: event.data.phase_risk === true,
    });
  };
  return node;
}

function createSourceDiagnosticsNode(context, onDiagnostics) {
  const node = new AudioWorkletNode(context, "avantiqo-music-source-diagnostics", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
  node.channelCountMode = "max";
  node.port.onmessage = (event) => {
    if (event.data?.type !== "source_diagnostics") return;
    onDiagnostics?.({
      available: true,
      rms_dbfs: finite(event.data.rms_dbfs, -Infinity),
      peak_dbfs: finite(event.data.peak_dbfs, -Infinity),
      dc_offset: finite(event.data.dc_offset, 0),
      dc_offset_dbfs: finite(event.data.dc_offset_dbfs, -Infinity),
      background_floor_estimate_dbfs: finite(event.data.background_floor_estimate_dbfs, -Infinity),
      hum_50_relative_db: finite(event.data.hum_50_relative_db, -Infinity),
      hum_60_relative_db: finite(event.data.hum_60_relative_db, -Infinity),
      dominant_hum_hz: Number.isFinite(Number(event.data.dominant_hum_hz)) ? Number(event.data.dominant_hum_hz) : null,
      dominant_hum_relative_db: finite(event.data.dominant_hum_relative_db, -Infinity),
      hum_warning: event.data.hum_warning === true,
      dc_offset_warning: event.data.dc_offset_warning === true,
      floor_history_windows: Math.max(0, Math.round(finite(event.data.floor_history_windows, 0))),
      floor_is_estimate: event.data.floor_is_estimate !== false,
    });
  };
  return node;
}

async function loadBuffer(context, url) {
  if (!url) throw new Error("CREATIVE_MUSIC_MULTITRACK_PREVIEW_SOURCE_URL_REQUIRED");
  if (BUFFER_CACHE.has(url)) return BUFFER_CACHE.get(url);
  const promise = fetch(url, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`CREATIVE_MUSIC_MULTITRACK_PREVIEW_FETCH_${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => context.decodeAudioData(bytes.slice(0)));
  BUFFER_CACHE.set(url, promise);
  try {
    return await promise;
  } catch (error) {
    BUFFER_CACHE.delete(url);
    throw error;
  }
}

function enabledInsert(track, type) {
  return (track?.inserts || []).find((insert) => insert.type === type && insert.enabled !== false && insert.bypass !== true) || null;
}

function needsDynamicsWorklet(session) {
  return (session?.tracks || []).some((track) => enabledInsert(track, "gate") || enabledInsert(track, "deesser"));
}

function createWorkletInsert(context, name, insert, onMeter) {
  const node = new AudioWorkletNode(context, name, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: insert?.parameters || {},
  });
  node.channelCountMode = "max";
  if (onMeter) {
    node.port.onmessage = (event) => {
      if (event.data?.type === "meter") onMeter(event.data);
    };
  }
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
  const dry = context.createGain();
  dry.gain.value = 1 - mix;
  const shaper = context.createWaveShaper();
  shaper.curve = saturationCurve(parameters.drive_db);
  shaper.oversample = "4x";
  const wet = context.createGain();
  wet.gain.value = mix;
  const output = context.createGain();
  output.gain.value = dbToGain(parameters.output_db);
  input.connect(dry);
  input.connect(shaper);
  shaper.connect(wet);
  dry.connect(output);
  wet.connect(output);
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
  const bands = Array.isArray(track?.channel_strip?.eq_bands)
    ? track.channel_strip.eq_bands.filter((band) => band.enabled !== false)
    : [];
  let chain = input;
  for (const band of bands) {
    const type = browserFilterType(String(band.type || "bell").toLowerCase());
    if (!type) continue;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = Math.max(20, Math.min(20000, finite(band.frequency_hz, 1000)));
    filter.Q.value = Math.max(0.1, Math.min(18, finite(band.q, 1)));
    if (!["notch", "highpass", "lowpass"].includes(String(band.type || "").toLowerCase())) {
      filter.gain.value = Math.max(-18, Math.min(18, finite(band.gain_db, 0)));
    }
    chain.connect(filter);
    chain = filter;
  }
  return chain;
}

function connectSourceCleanup(context, input, track) {
  const cleanup = track?.source_cleanup || {};
  if (cleanup.enabled === false) return input;
  let chain = input;
  if (cleanup.dc_blocker?.enabled === true) {
    const blocker = context.createBiquadFilter();
    blocker.type = "highpass";
    blocker.frequency.value = Math.max(5, Math.min(35, finite(cleanup.dc_blocker.cutoff_hz, 15)));
    blocker.Q.value = 0.707;
    chain.connect(blocker);
    chain = blocker;
  }
  if (cleanup.hum_notch?.enabled === true) {
    const base = Number(cleanup.hum_notch.frequency_hz) === 60 ? 60 : 50;
    const q = Math.max(4, Math.min(40, finite(cleanup.hum_notch.q, 18)));
    const harmonics = Math.max(1, Math.min(4, Math.round(finite(cleanup.hum_notch.harmonics, 3))));
    for (let harmonic = 1; harmonic <= harmonics; harmonic += 1) {
      const frequency = base * harmonic;
      if (frequency >= context.sampleRate / 2) break;
      const notch = context.createBiquadFilter();
      notch.type = "notch";
      notch.frequency.value = frequency;
      notch.Q.value = q;
      chain.connect(notch);
      chain = notch;
    }
  }
  return chain;
}

function deterministicNoise(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return (value / 0xffffffff) * 2 - 1;
  };
}

function createReverbImpulse(context, decaySeconds) {
  const duration = Math.max(0.1, Math.min(12, finite(decaySeconds, 2.2)));
  const frames = Math.max(1, Math.round(context.sampleRate * duration));
  const buffer = context.createBuffer(2, frames, context.sampleRate);
  const leftNoise = deterministicNoise(0x41564e54);
  const rightNoise = deterministicNoise(0x49514f52);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    const noise = channel === 0 ? leftNoise : rightNoise;
    for (let frame = 0; frame < frames; frame += 1) {
      const progress = frame / frames;
      const envelope = (1 - progress) ** 2.4;
      data[frame] = noise() * envelope;
    }
  }
  return buffer;
}

function createReverbBus(context, bus, destination) {
  const parameters = bus?.parameters || {};
  const input = context.createGain();
  const preDelay = context.createDelay(0.3);
  preDelay.delayTime.value = Math.max(0, Math.min(0.25, finite(parameters.pre_delay_ms, 18) / 1000));
  const damping = context.createBiquadFilter();
  damping.type = "lowpass";
  damping.frequency.value = Math.max(1000, Math.min(20000, finite(parameters.damping_hz, 8500)));
  const convolver = context.createConvolver();
  convolver.buffer = createReverbImpulse(context, parameters.decay_seconds);
  const wet = context.createGain();
  wet.gain.value = bus?.mute === true ? 0 : dbToGain(finite(parameters.wet_db, -3) + finite(bus?.gain_db, 0));
  input.connect(preDelay);
  preDelay.connect(damping);
  damping.connect(convolver);
  convolver.connect(wet);
  wet.connect(destination);
  return { input, type: "reverb" };
}

function createDelayBus(context, bus, destination) {
  const parameters = bus?.parameters || {};
  const input = context.createGain();
  const lowCut = context.createBiquadFilter();
  lowCut.type = "highpass";
  lowCut.frequency.value = Math.max(20, Math.min(1000, finite(parameters.low_cut_hz, 180)));
  const delay = context.createDelay(2.1);
  delay.delayTime.value = Math.max(0.01, Math.min(2, finite(parameters.time_seconds, 0.375)));
  const highCut = context.createBiquadFilter();
  highCut.type = "lowpass";
  highCut.frequency.value = Math.max(1000, Math.min(20000, finite(parameters.high_cut_hz, 7000)));
  const feedback = context.createGain();
  feedback.gain.value = Math.max(0, Math.min(0.92, finite(parameters.feedback, 0.28)));
  const wet = context.createGain();
  wet.gain.value = bus?.mute === true ? 0 : dbToGain(finite(parameters.wet_db, -6) + finite(bus?.gain_db, 0));
  input.connect(lowCut);
  lowCut.connect(delay);
  delay.connect(highCut);
  highCut.connect(wet);
  highCut.connect(feedback);
  feedback.connect(delay);
  wet.connect(destination);
  return { input, type: "delay" };
}

function createAuxBuses(context, session, master) {
  const buses = Array.isArray(session?.buses) ? [...session.buses] : [];
  const auxInputs = new Map();
  const defaultReverb = {
    id: "bus-reverb", type: "aux", effect_type: "reverb", gain_db: 0,
    parameters: { pre_delay_ms: 18, decay_seconds: 2.2, damping_hz: 8500, wet_db: -3 },
  };
  const defaultDelay = {
    id: "bus-delay", type: "aux", effect_type: "delay", gain_db: 0,
    parameters: { time_seconds: 0.375, feedback: 0.28, high_cut_hz: 7000, low_cut_hz: 180, wet_db: -6 },
  };
  const requestedIds = new Set((session?.tracks || []).flatMap((track) => (track.sends || []).filter((send) => send.enabled !== false).map((send) => send.bus_id)));
  const auxBuses = buses.filter((bus) => bus.type === "aux");
  if (requestedIds.has("bus-reverb") && !auxBuses.some((bus) => bus.id === "bus-reverb")) auxBuses.push(defaultReverb);
  if (requestedIds.has("bus-delay") && !auxBuses.some((bus) => bus.id === "bus-delay")) auxBuses.push(defaultDelay);
  for (const bus of auxBuses) {
    const effectType = String(bus.effect_type || "").toLowerCase();
    const created = effectType === "reverb"
      ? createReverbBus(context, bus, master)
      : effectType === "delay"
        ? createDelayBus(context, bus, master)
        : null;
    if (created) auxInputs.set(bus.id, created.input);
  }
  return auxInputs;
}

function connectTrackStrip(context, track, destination, auxInputs, trackMeter, stereoMeteringAvailable, sourceDiagnosticsAvailable) {
  const strip = track.channel_strip || {};
  const clipBus = context.createGain();
  const trim = context.createGain();
  trim.gain.value = dbToGain(strip.input_trim_db);
  const polarity = context.createGain();
  polarity.gain.value = strip.polarity_invert === true ? -1 : 1;

  trackMeter.source_diagnostics = emptySourceDiagnostics();
  let preTrim = clipBus;
  if (sourceDiagnosticsAvailable) {
    const sourceDiagnostics = createSourceDiagnosticsNode(context, (diagnostics) => {
      trackMeter.source_diagnostics = diagnostics;
    });
    clipBus.connect(sourceDiagnostics);
    preTrim = sourceDiagnostics;
  }
  const cleanedSource = connectSourceCleanup(context, preTrim, track);
  cleanedSource.connect(trim);
  trim.connect(polarity);

  let chain = polarity;
  const gate = enabledInsert(track, "gate");
  if (gate) {
    const gateNode = createWorkletInsert(context, "avantiqo-music-gate", gate, (meter) => {
      trackMeter.gate_reduction_db = Math.max(0, finite(meter.reduction_db, 0));
      trackMeter.gate_open = meter.open === true;
    });
    chain.connect(gateNode);
    chain = gateNode;
  }

  const highPass = context.createBiquadFilter();
  highPass.type = "highpass";
  highPass.frequency.value = Math.max(20, finite(strip.high_pass_hz, 20));
  highPass.Q.value = 0.707;
  const lowShelf = context.createBiquadFilter();
  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = 120;
  lowShelf.gain.value = finite(strip.low_shelf_db, 0);
  const presence = context.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 3200;
  presence.Q.value = 0.8;
  presence.gain.value = finite(strip.presence_db, 0);
  const highShelf = context.createBiquadFilter();
  highShelf.type = "highshelf";
  highShelf.frequency.value = 8000;
  highShelf.gain.value = finite(strip.high_shelf_db, 0);
  chain.connect(highPass);
  highPass.connect(lowShelf);
  lowShelf.connect(presence);
  presence.connect(highShelf);
  chain = connectParametricEq(context, highShelf, track);

  const deesser = enabledInsert(track, "deesser");
  if (deesser) {
    const deesserNode = createWorkletInsert(context, "avantiqo-music-deesser", deesser, (meter) => {
      trackMeter.deesser_reduction_db = Math.max(0, finite(meter.reduction_db, 0));
    });
    chain.connect(deesserNode);
    chain = deesserNode;
  }

  const saturation = enabledInsert(track, "saturation");
  if (saturation) chain = connectSaturation(context, chain, saturation);

  const compressor = context.createDynamicsCompressor();
  const comp = strip.compressor || {};
  compressor.threshold.value = finite(comp.threshold_db, -18);
  compressor.ratio.value = Math.max(1, finite(comp.ratio, 3));
  compressor.attack.value = Math.max(0.0001, finite(comp.attack_ms, 15) / 1000);
  compressor.release.value = Math.max(0.01, finite(comp.release_ms, 150) / 1000);
  compressor.knee.value = Math.max(0, finite(comp.knee_db, 6));
  const makeup = context.createGain();
  makeup.gain.value = comp.enabled === true ? dbToGain(comp.makeup_db) : 1;
  if (comp.enabled === true) {
    chain.connect(compressor);
    compressor.connect(makeup);
    trackMeter.compressor = compressor;
  } else {
    chain.connect(makeup);
  }

  const fader = context.createGain();
  fader.gain.value = track.mute === true ? 0 : dbToGain(track.gain_db);
  const pan = context.createStereoPanner();
  pan.pan.value = Math.max(-1, Math.min(1, finite(track.pan, 0)));
  const postFaderAnalyser = context.createAnalyser();
  postFaderAnalyser.fftSize = 1024;
  postFaderAnalyser.smoothingTimeConstant = 0.35;
  trackMeter.analyser = postFaderAnalyser;
  trackMeter.scratch = new Float32Array(postFaderAnalyser.fftSize);
  trackMeter.stereo = emptyStereoMeter();
  trackMeter.source_cleanup_active = track?.source_cleanup?.enabled !== false
    && (track?.source_cleanup?.dc_blocker?.enabled === true || track?.source_cleanup?.hum_notch?.enabled === true);
  trackMeter.dc_blocker_enabled = track?.source_cleanup?.enabled !== false && track?.source_cleanup?.dc_blocker?.enabled === true;
  trackMeter.hum_notch_enabled = track?.source_cleanup?.enabled !== false && track?.source_cleanup?.hum_notch?.enabled === true;

  makeup.connect(fader);
  fader.connect(pan);
  if (stereoMeteringAvailable) {
    const stereoMeter = createStereoMeterNode(context, (stereo) => {
      trackMeter.stereo = stereo;
    });
    pan.connect(stereoMeter);
    stereoMeter.connect(postFaderAnalyser);
  } else {
    pan.connect(postFaderAnalyser);
  }
  postFaderAnalyser.connect(destination);

  if (track.mute !== true) {
    for (const send of track.sends || []) {
      if (send.enabled === false) continue;
      const auxInput = auxInputs?.get(send.bus_id);
      if (!auxInput) continue;
      const sendGain = context.createGain();
      sendGain.gain.value = dbToGain(finite(send.level_db, -18));
      const tap = send.pre_fader === true ? makeup : pan;
      tap.connect(sendGain);
      sendGain.connect(auxInput);
    }
  }
  return { clipBus, fader, pan, postFaderAnalyser };
}

function compPlaybackClips(track) {
  const regions = Array.isArray(track?.comp?.regions) ? track.comp.regions : [];
  if (!regions.length) return null;
  return regions.map((region, index) => ({
    id: region.id || `comp-preview-${track.id}-${index}`,
    source_asset_id: region.source_asset_id,
    start_seconds: finite(region.start_seconds, 0),
    duration_seconds: Math.max(0, finite(region.end_seconds, 0) - finite(region.start_seconds, 0)),
    source_offset_seconds: Math.max(0, finite(region.source_offset_seconds, 0)),
    gain_db: finite(region.gain_db, 0),
    fade_in_seconds: Math.max(0, finite(region.fade_in_seconds, track.comp?.crossfade_default_seconds || 0.015)),
    fade_out_seconds: Math.max(0, finite(region.fade_out_seconds, track.comp?.crossfade_default_seconds || 0.015)),
    muted: false,
    derived_comp_preview: true,
    destructive_edit: false,
  }));
}

function selectedTakePlaybackClips(track) {
  const takes = Array.isArray(track?.takes) ? track.takes : [];
  const clips = Array.isArray(track?.clips) ? track.clips : [];
  if (takes.length <= 1) return clips;
  const selectedTake = takes.find((take) => take.selected_for_comp === true) || takes[0];
  if (!selectedTake?.source_asset_id) return clips.slice(0, 1);
  const matching = clips.filter((clip) => clip.source_asset_id === selectedTake.source_asset_id);
  if (matching.length) return matching;
  return [{
    id: `take-preview-${selectedTake.id}`,
    source_asset_id: selectedTake.source_asset_id,
    start_seconds: Math.max(0, finite(selectedTake.start_seconds, 0)),
    duration_seconds: Math.max(0, finite(selectedTake.duration_seconds, 0)),
    source_offset_seconds: 0,
    gain_db: 0,
    fade_in_seconds: 0,
    fade_out_seconds: 0,
    muted: false,
    take_lane_preview: true,
    destructive_edit: false,
  }];
}

export function resolveMusicTrackPreviewClips(track = {}) {
  return compPlaybackClips(track) || selectedTakePlaybackClips(track);
}

function scheduleClip(context, buffer, clip, trackBus, transportStartSeconds, contextStartTime, sources, stopAtSeconds = null) {
  if (clip.muted === true) return;
  const clipStart = Math.max(0, finite(clip.start_seconds, 0));
  const clipEnd = clipStart + Math.max(0, finite(clip.duration_seconds, 0));
  if (clipEnd <= transportStartSeconds) return;
  if (Number.isFinite(stopAtSeconds) && clipStart >= stopAtSeconds) return;
  const offsetIntoClip = Math.max(0, transportStartSeconds - clipStart);
  const sourceOffset = Math.max(0, finite(clip.source_offset_seconds, 0) + offsetIntoClip);
  const available = Math.max(0, buffer.duration - sourceOffset);
  let scheduledDuration = Math.min(Math.max(0, finite(clip.duration_seconds, 0) - offsetIntoClip), available);
  if (Number.isFinite(stopAtSeconds)) {
    const transportClipStart = Math.max(transportStartSeconds, clipStart);
    scheduledDuration = Math.min(scheduledDuration, Math.max(0, stopAtSeconds - transportClipStart));
  }
  if (scheduledDuration <= 0) return;
  const source = context.createBufferSource();
  source.buffer = buffer;
  const clipGain = context.createGain();
  const baseGain = dbToGain(clip.gain_db);
  clipGain.gain.value = baseGain;
  source.connect(clipGain);
  clipGain.connect(trackBus);
  const when = contextStartTime + Math.max(0, clipStart - transportStartSeconds);
  const fadeIn = Math.min(scheduledDuration / 2, Math.max(0, finite(clip.fade_in_seconds, 0)));
  const fadeOut = Math.min(scheduledDuration / 2, Math.max(0, finite(clip.fade_out_seconds, 0)));
  if (fadeIn > 0 && offsetIntoClip < fadeIn) {
    const progress = Math.max(0, Math.min(1, offsetIntoClip / fadeIn));
    clipGain.gain.setValueAtTime(baseGain * progress, when);
    clipGain.gain.linearRampToValueAtTime(baseGain, when + Math.max(0.001, fadeIn - offsetIntoClip));
  }
  if (fadeOut > 0) {
    const fadeStart = when + Math.max(0, scheduledDuration - fadeOut);
    clipGain.gain.setValueAtTime(baseGain, fadeStart);
    clipGain.gain.linearRampToValueAtTime(0, when + scheduledDuration);
  }
  source.start(when, sourceOffset, scheduledDuration);
  sources.push(source);
}

function startLiveMeterPublisher({ masterAnalyser, masterStereo, trackMeters, stereoMeteringAvailable, sourceDiagnosticsAvailable }) {
  const masterScratch = new Float32Array(masterAnalyser.fftSize);
  const timer = setInterval(() => {
    const masterLevels = analyserLevels(masterAnalyser, masterScratch);
    const tracks = [];
    for (const meter of trackMeters.values()) {
      const levels = analyserLevels(meter.analyser, meter.scratch);
      const diagnostics = meter.source_diagnostics || emptySourceDiagnostics();
      tracks.push({
        track_id: meter.track_id,
        track_name: meter.track_name,
        ...levels,
        compressor_reduction_db: meter.compressor ? Math.max(0, -finite(meter.compressor.reduction, 0)) : 0,
        gate_reduction_db: Math.max(0, finite(meter.gate_reduction_db, 0)),
        gate_open: meter.gate_open !== false,
        deesser_reduction_db: Math.max(0, finite(meter.deesser_reduction_db, 0)),
        stereo_meter_available: stereoMeteringAvailable,
        stereo_correlation: meter.stereo?.correlation,
        left_rms_dbfs: meter.stereo?.left_rms_dbfs,
        right_rms_dbfs: meter.stereo?.right_rms_dbfs,
        left_peak_dbfs: meter.stereo?.left_peak_dbfs,
        right_peak_dbfs: meter.stereo?.right_peak_dbfs,
        balance_db: meter.stereo?.balance_db,
        mono_compatibility_warning: meter.stereo?.mono_compatibility_warning === true,
        phase_risk: meter.stereo?.phase_risk === true,
        source_diagnostics_available: sourceDiagnosticsAvailable && diagnostics.available === true,
        source_rms_dbfs: diagnostics.rms_dbfs,
        source_peak_dbfs: diagnostics.peak_dbfs,
        background_floor_estimate_dbfs: diagnostics.background_floor_estimate_dbfs,
        floor_history_windows: diagnostics.floor_history_windows,
        floor_is_estimate: diagnostics.floor_is_estimate !== false,
        hum_50_relative_db: diagnostics.hum_50_relative_db,
        hum_60_relative_db: diagnostics.hum_60_relative_db,
        dominant_hum_hz: diagnostics.dominant_hum_hz,
        dominant_hum_relative_db: diagnostics.dominant_hum_relative_db,
        hum_warning: diagnostics.hum_warning === true,
        dc_offset: diagnostics.dc_offset,
        dc_offset_dbfs: diagnostics.dc_offset_dbfs,
        dc_offset_warning: diagnostics.dc_offset_warning === true,
        source_cleanup_active: meter.source_cleanup_active === true,
        dc_blocker_enabled: meter.dc_blocker_enabled === true,
        hum_notch_enabled: meter.hum_notch_enabled === true,
      });
    }
    publishMeter({
      contract: "AVANTIQO_MUSIC_LIVE_ENGINEERING_METER_V4",
      active: true,
      timestamp_ms: Date.now(),
      master: {
        ...masterLevels,
        headroom_db: Number.isFinite(masterLevels.peak_dbfs) ? Math.max(0, -masterLevels.peak_dbfs) : Infinity,
        stereo_meter_available: stereoMeteringAvailable,
        stereo_correlation: masterStereo?.correlation,
        left_rms_dbfs: masterStereo?.left_rms_dbfs,
        right_rms_dbfs: masterStereo?.right_rms_dbfs,
        left_peak_dbfs: masterStereo?.left_peak_dbfs,
        right_peak_dbfs: masterStereo?.right_peak_dbfs,
        balance_db: masterStereo?.balance_db,
        mono_compatibility_warning: masterStereo?.mono_compatibility_warning === true,
        phase_risk: masterStereo?.phase_risk === true,
      },
      source_diagnostics_available: sourceDiagnosticsAvailable,
      tracks,
    });
  }, 50);
  return () => {
    clearInterval(timer);
    publishMeter({
      contract: "AVANTIQO_MUSIC_LIVE_ENGINEERING_METER_V4",
      active: false,
      timestamp_ms: Date.now(),
      master: {
        peak_dbfs: -Infinity,
        rms_dbfs: -Infinity,
        clipping: false,
        headroom_db: Infinity,
        stereo_meter_available: stereoMeteringAvailable,
        stereo_correlation: null,
        left_rms_dbfs: -Infinity,
        right_rms_dbfs: -Infinity,
        left_peak_dbfs: -Infinity,
        right_peak_dbfs: -Infinity,
        balance_db: 0,
        mono_compatibility_warning: false,
        phase_risk: false,
      },
      source_diagnostics_available: sourceDiagnosticsAvailable,
      tracks: [],
    });
  };
}

export async function startMusicMultitrackPreview({ session, assetUrls, startSeconds = 0, stopAtSeconds = null, onEnded } = {}) {
  if (!session) throw new Error("CREATIVE_MUSIC_MULTITRACK_PREVIEW_SESSION_REQUIRED");
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) throw new Error("CREATIVE_MUSIC_MULTITRACK_PREVIEW_AUDIO_CONTEXT_UNAVAILABLE");
  const context = new AudioContextClass({ latencyHint: "interactive", sampleRate: session.sample_rate || undefined });
  await context.resume();
  const dynamicsRequired = needsDynamicsWorklet(session);
  if (dynamicsRequired) {
    await context.audioWorklet.addModule("/audio/avantiqo-music-dynamics-worklet.js");
  }

  let stereoMeteringAvailable = false;
  let sourceDiagnosticsAvailable = false;
  if (context.audioWorklet && typeof globalThis.AudioWorkletNode === "function") {
    try {
      await context.audioWorklet.addModule(STEREO_METER_MODULE);
      stereoMeteringAvailable = true;
    } catch {
      stereoMeteringAvailable = false;
    }
    try {
      await context.audioWorklet.addModule(SOURCE_DIAGNOSTICS_MODULE);
      sourceDiagnosticsAvailable = true;
    } catch {
      sourceDiagnosticsAvailable = false;
    }
  }

  const master = context.createGain();
  master.gain.value = dbToGain(session.buses?.find((bus) => bus.id === "bus-master")?.gain_db || 0);
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.25;
  const masterStereo = emptyStereoMeter();
  if (stereoMeteringAvailable) {
    const masterStereoNode = createStereoMeterNode(context, (stereo) => Object.assign(masterStereo, stereo));
    master.connect(masterStereoNode);
    masterStereoNode.connect(analyser);
  } else {
    master.connect(analyser);
  }
  analyser.connect(context.destination);
  const auxInputs = createAuxBuses(context, session, master);

  const soloActive = (session.tracks || []).some((track) => track.solo === true);
  const sources = [];
  const trackMeters = new Map();
  const contextStartTime = context.currentTime + 0.03;
  let maxEnd = startSeconds;
  for (const track of session.tracks || []) {
    const effectiveMute = track.mute === true || (soloActive && track.solo !== true);
    const previewTrack = effectiveMute ? { ...track, mute: true } : track;
    const meter = {
      track_id: track.id,
      track_name: track.name || "Track",
      gate_reduction_db: 0,
      gate_open: true,
      deesser_reduction_db: 0,
      compressor: null,
      analyser: null,
      scratch: null,
      stereo: emptyStereoMeter(),
      source_diagnostics: emptySourceDiagnostics(),
      source_cleanup_active: false,
      dc_blocker_enabled: false,
      hum_notch_enabled: false,
    };
    trackMeters.set(track.id, meter);
    const { clipBus } = connectTrackStrip(
      context,
      previewTrack,
      master,
      auxInputs,
      meter,
      stereoMeteringAvailable,
      sourceDiagnosticsAvailable,
    );
    const playbackClips = resolveMusicTrackPreviewClips(track);
    for (const clip of playbackClips) {
      const url = assetUrls?.[clip.source_asset_id];
      if (!url) continue;
      const buffer = await loadBuffer(context, url);
      scheduleClip(context, buffer, clip, clipBus, startSeconds, contextStartTime, sources, stopAtSeconds);
      maxEnd = Math.max(maxEnd, finite(clip.start_seconds, 0) + finite(clip.duration_seconds, 0));
    }
  }

  const stopMetering = startLiveMeterPublisher({
    masterAnalyser: analyser,
    masterStereo,
    trackMeters,
    stereoMeteringAvailable,
    sourceDiagnosticsAvailable,
  });
  const effectiveEnd = Number.isFinite(stopAtSeconds) ? Math.min(maxEnd, stopAtSeconds) : maxEnd;
  const duration = Math.max(0, effectiveEnd - startSeconds);
  let ended = false;
  let timer = null;
  const position = () => {
    const elapsed = Math.max(0, context.currentTime - contextStartTime);
    return Math.min(effectiveEnd, Math.max(startSeconds, startSeconds + elapsed));
  };
  const finish = (natural) => {
    if (ended) return;
    ended = true;
    if (timer) clearTimeout(timer);
    stopMetering();
    const endedAt = position();
    context.close().catch(() => {});
    onEnded?.({ position_seconds: endedAt, natural });
  };
  timer = duration > 0 ? setTimeout(() => finish(true), (duration + 0.06) * 1000) : null;

  return {
    contract: "AVANTIQO_MUSIC_MULTITRACK_BROWSER_PREVIEW_V10",
    release_master: false,
    take_lane_aware: true,
    comp_aware: true,
    aux_send_aware: true,
    engineering_inserts_aware: true,
    parametric_eq_aware: true,
    source_cleanup_aware: true,
    live_engineering_metering: true,
    stereo_correlation_metering: stereoMeteringAvailable,
    mono_compatibility_metering: stereoMeteringAvailable,
    pre_insert_source_diagnostics: sourceDiagnosticsAvailable,
    background_floor_estimation: sourceDiagnosticsAvailable,
    mains_hum_detection: sourceDiagnosticsAvailable,
    dc_offset_detection: sourceDiagnosticsAvailable,
    dynamics_worklet_loaded: dynamicsRequired,
    audible_reverb_send: auxInputs.has("bus-reverb"),
    audible_delay_send: auxInputs.has("bus-delay"),
    context,
    analyser,
    started_at_context_time: contextStartTime,
    transport_start_seconds: startSeconds,
    transport_end_seconds: effectiveEnd,
    duration_seconds: duration,
    currentPosition: position,
    stop() {
      if (ended) return position();
      const stoppedAt = position();
      for (const source of sources) {
        try { source.stop(); } catch {}
      }
      finish(false);
      return stoppedAt;
    },
  };
}

export function clearMusicMultitrackPreviewCache() {
  BUFFER_CACHE.clear();
}
