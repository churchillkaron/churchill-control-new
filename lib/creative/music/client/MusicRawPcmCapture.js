import { analyzeMusicCaptureQc } from "./MusicCaptureQcRuntime";

function dbfs(value) {
  if (!Number.isFinite(value) || value <= 0) return -Infinity;
  return 20 * Math.log10(value);
}

function mergeChannels(chunksByChannel) {
  return chunksByChannel.map((chunks) => {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Float32Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged;
  });
}

function encodeWav24(channels, sampleRate) {
  const channelCount = Math.max(1, channels.length);
  const frames = channels[0]?.length || 0;
  const bytesPerSample = 3;
  const blockAlign = channelCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + frames * blockAlign);
  const view = new DataView(buffer);
  const writeText = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + frames * blockAlign, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 24, true);
  writeText(36, "data");
  view.setUint32(40, frames * blockAlign, true);
  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel]?.[frame] ?? channels[0]?.[frame] ?? 0));
      const value = sample < 0 ? Math.round(sample * 0x800000) : Math.round(sample * 0x7fffff);
      view.setUint8(offset, value & 0xff);
      view.setUint8(offset + 1, (value >> 8) & 0xff);
      view.setUint8(offset + 2, (value >> 16) & 0xff);
      offset += 3;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function freshStats() {
  return { sumSquares: 0, samples: 0, peak: 0, clipped: false };
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
}

function normalizeMonitorMode(value) {
  return String(value || "off").trim().toLowerCase() === "software" ? "software" : "off";
}

function monitorLinearGain(mode, gainDb) {
  if (mode !== "software") return 0;
  return 10 ** (clamp(gainDb, -60, 0, -18) / 20);
}

function captureTruth(stream) {
  const track = stream?.getAudioTracks?.()?.[0] || null;
  const settings = track?.getSettings?.() || {};
  const states = [settings.echoCancellation, settings.noiseSuppression, settings.autoGainControl];
  const known = states.filter((value) => typeof value === "boolean");
  const allDisabled = known.length === 3 && known.every((value) => value === false);
  const anyEnabled = known.some((value) => value === true);
  const sampleSize = Number(settings.sampleSize);
  return {
    browser_processing_disabled: allDisabled,
    browser_processing_verification: anyEnabled ? "PROCESSING_PRESENT" : allDisabled ? "VERIFIED_DISABLED" : known.length ? "PARTIAL" : "UNVERIFIED",
    requested_browser_processing_disabled: true,
    device_sample_rate: Number.isFinite(Number(settings.sampleRate)) ? Number(settings.sampleRate) : null,
    device_channel_count: Number.isFinite(Number(settings.channelCount)) ? Number(settings.channelCount) : null,
    capture_sample_size_bits: Number.isFinite(sampleSize) ? sampleSize : null,
    native_capture_precision_verified: Number.isFinite(sampleSize) && sampleSize === 24,
    effective_capture_precision_known: Number.isFinite(sampleSize),
    wav_container_bit_depth: 24,
  };
}

export async function startMusicRawPcmCapture({
  deviceId = null,
  onLevel = null,
  monitorMode = "off",
  monitorGainDb = -18,
} = {}) {
  if (!navigator.mediaDevices?.getUserMedia || !globalThis.AudioContext || !globalThis.AudioWorkletNode) {
    throw new Error("CREATIVE_MUSIC_RAW_CAPTURE_UNAVAILABLE");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: 2 },
    },
    video: false,
  });
  const truth = captureTruth(stream);
  const context = new AudioContext({ latencyHint: "interactive" });
  const contextSampleRate = Number(context.sampleRate);
  const deviceSampleRate = Number(truth.device_sample_rate);
  const deviceRateKnown = Number.isFinite(deviceSampleRate) && deviceSampleRate > 0;
  const contextRateKnown = Number.isFinite(contextSampleRate) && contextSampleRate > 0;
  const sampleRateMismatch = deviceRateKnown && contextRateKnown && Math.abs(deviceSampleRate - contextSampleRate) >= 1;
  truth.audio_context_sample_rate = contextRateKnown ? contextSampleRate : null;
  truth.sample_rate_conversion_detected = sampleRateMismatch;
  truth.native_sample_rate_path_verified = deviceRateKnown && contextRateKnown && !sampleRateMismatch;
  truth.sample_rate_path_verification = !deviceRateKnown || !contextRateKnown ? "UNVERIFIED" : sampleRateMismatch ? "RESAMPLED" : "MATCHED";
  await context.audioWorklet.addModule("/audio/avantiqo-pcm-recorder-worklet.js");
  const source = context.createMediaStreamSource(stream);
  const reportedInputChannels = Number(truth.device_channel_count);
  const recorderChannels = Number.isFinite(reportedInputChannels) && reportedInputChannels > 0
    ? Math.min(2, Math.max(1, Math.round(reportedInputChannels)))
    : Math.min(2, Math.max(1, source.channelCount || 1));
  truth.recorder_channel_count_requested = recorderChannels;
  truth.channel_topology_source = Number.isFinite(reportedInputChannels) && reportedInputChannels > 0 ? "MEDIA_TRACK_SETTINGS" : "MEDIA_STREAM_SOURCE_FALLBACK";
  const recorder = new AudioWorkletNode(context, "avantiqo-pcm-recorder", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [recorderChannels],
  });
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  const monitorGain = context.createGain();
  let currentMonitorMode = normalizeMonitorMode(monitorMode);
  let currentMonitorGainDb = clamp(monitorGainDb, -60, 0, -18);
  monitorGain.gain.value = monitorLinearGain(currentMonitorMode, currentMonitorGainDb);
  source.connect(recorder);
  source.connect(analyser);
  recorder.connect(monitorGain);
  monitorGain.connect(context.destination);

  let chunks = [];
  let stats = freshStats();
  let finishResolve = null;
  let expectedSequence = 0;
  let expectedFrameStart = 0;
  let passFrameBase = 0;
  let chunkGapCount = 0;
  let frameDiscontinuityCount = 0;
  let stopped = false;
  let splitting = false;
  const timeData = new Float32Array(analyser.fftSize);

  recorder.port.onmessage = (event) => {
    if (event.data?.type === "pcm" && Array.isArray(event.data.channels)) {
      const sequence = Number(event.data.sequence);
      const frameStart = Number(event.data.frame_start);
      const frameEnd = Number(event.data.frame_end);
      const frames = Number(event.data.frames);
      if (!Number.isFinite(sequence) || sequence !== expectedSequence) chunkGapCount += 1;
      if (!Number.isFinite(frameStart) || frameStart !== expectedFrameStart || !Number.isFinite(frameEnd) || !Number.isFinite(frames) || frameEnd - frameStart !== frames) frameDiscontinuityCount += 1;
      expectedSequence = Number.isFinite(sequence) ? sequence + 1 : expectedSequence + 1;
      expectedFrameStart = Number.isFinite(frameEnd) ? frameEnd : expectedFrameStart + Math.max(0, Number.isFinite(frames) ? frames : 0);
      const channels = event.data.channels.map((value) => new Float32Array(value));
      if (!chunks.length) channels.forEach(() => chunks.push([]));
      channels.forEach((chunk, index) => chunks[index]?.push(chunk));
      for (const chunk of channels) {
        for (let index = 0; index < chunk.length; index += 1) {
          const sample = chunk[index];
          const abs = Math.abs(sample);
          stats.peak = Math.max(stats.peak, abs);
          stats.sumSquares += sample * sample;
          stats.samples += 1;
          if (abs >= 0.999) stats.clipped = true;
        }
      }
    }
    if (event.data?.type === "flushed" && event.data?.reason === "manual") {
      finishResolve?.();
      finishResolve = null;
    }
  };

  const meterTimer = setInterval(() => {
    analyser.getFloatTimeDomainData(timeData);
    let peak = 0;
    let sumSquares = 0;
    for (let index = 0; index < timeData.length; index += 1) {
      const sample = timeData[index];
      peak = Math.max(peak, Math.abs(sample));
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / timeData.length);
    onLevel?.({ peak_dbfs: dbfs(peak), rms_dbfs: dbfs(rms), clipping: peak >= 0.999 || stats.clipped });
  }, 100);

  function cleanup() {
    clearInterval(meterTimer);
    try { source.disconnect(); } catch {}
    try { recorder.disconnect(); } catch {}
    try { analyser.disconnect(); } catch {}
    try { monitorGain.disconnect(); } catch {}
    stream.getTracks().forEach((track) => track.stop());
    context.close().catch(() => {});
  }

  async function flush() {
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 1000);
      finishResolve = () => { clearTimeout(timeout); resolve(); };
      recorder.port.postMessage({ type: "flush" });
    });
  }

  function materializePass({ allowEmpty = false } = {}) {
    const channels = mergeChannels(chunks);
    if (!channels[0]?.length) {
      if (allowEmpty) return null;
      throw new Error("CREATIVE_MUSIC_RAW_CAPTURE_EMPTY");
    }
    const blob = encodeWav24(channels, context.sampleRate);
    const duration = channels[0].length / context.sampleRate;
    const passExpectedFrames = Math.max(0, expectedFrameStart - passFrameBase);
    const capture_qc = analyzeMusicCaptureQc(channels, context.sampleRate, { chunk_gap_count: chunkGapCount, frame_discontinuity_count: frameDiscontinuityCount, expected_frame_count: passExpectedFrames });
    const peak = dbfs(stats.peak);
    const rms = dbfs(Math.sqrt(stats.sumSquares / Math.max(1, stats.samples)));
    return {
      contract: "AVANTIQO_MUSIC_RAW_PCM_TAKE_V1",
      blob,
      duration_seconds: duration,
      sample_rate: context.sampleRate,
      channels: channels.length,
      bit_depth: 24,
      wav_container_bit_depth: 24,
      capture_sample_size_bits: truth.capture_sample_size_bits,
      native_capture_precision_verified: truth.native_capture_precision_verified,
      effective_capture_precision_known: truth.effective_capture_precision_known,
      device_sample_rate: truth.device_sample_rate,
      device_channel_count: truth.device_channel_count,
      recorder_channel_count_requested: truth.recorder_channel_count_requested,
      channel_topology_source: truth.channel_topology_source,
      recorded_channel_count: channels.length,
      channel_topology_verified: Number.isFinite(Number(truth.device_channel_count)) ? Number(truth.device_channel_count) === channels.length : null,
      audio_context_sample_rate: truth.audio_context_sample_rate,
      sample_rate_conversion_detected: truth.sample_rate_conversion_detected,
      native_sample_rate_path_verified: truth.native_sample_rate_path_verified,
      sample_rate_path_verification: truth.sample_rate_path_verification,
      browser_processing_verification: truth.browser_processing_verification,
      requested_browser_processing_disabled: true,
      peak_dbfs: peak,
      rms_dbfs: rms,
      capture_qc,
      headroom_db: capture_qc.headroom_db,
      crest_factor_db: capture_qc.crest_factor_db,
      dc_offset: capture_qc.dc_offset,
      background_floor_estimate_dbfs: capture_qc.background_floor_estimate_dbfs,
      channel_imbalance_db: capture_qc.channel_imbalance_db,
      recording_qc_status: capture_qc.status,
      chunk_gap_count: capture_qc.chunk_gap_count,
      frame_discontinuity_count: capture_qc.frame_discontinuity_count,
      capture_continuity_verified: capture_qc.capture_continuity_verified,
      clipping: stats.clipped || peak >= -0.1,
      browser_processing_disabled: truth.browser_processing_disabled,
      immutable_original_take: true,
      software_monitoring_mode: currentMonitorMode,
      software_monitor_gain_db: currentMonitorGainDb,
      monitoring_post_capture_only: true,
      capture_base_latency_seconds: Number(context.baseLatency || 0),
      capture_output_latency_seconds: Number(context.outputLatency || 0),
    };
  }

  function resetPass() {
    chunks = [];
    stats = freshStats();
    passFrameBase = expectedFrameStart;
    chunkGapCount = 0;
    frameDiscontinuityCount = 0;
  }

  async function splitPass({ allowEmpty = false } = {}) {
    if (stopped) throw new Error("CREATIVE_MUSIC_RAW_CAPTURE_ALREADY_STOPPED");
    if (splitting) throw new Error("CREATIVE_MUSIC_RAW_CAPTURE_SPLIT_IN_PROGRESS");
    splitting = true;
    try {
      await flush();
      const result = materializePass({ allowEmpty });
      resetPass();
      return result;
    } finally {
      splitting = false;
    }
  }

  function setMonitor({ mode = currentMonitorMode, gainDb = currentMonitorGainDb } = {}) {
    if (stopped) throw new Error("CREATIVE_MUSIC_RAW_CAPTURE_ALREADY_STOPPED");
    currentMonitorMode = normalizeMonitorMode(mode);
    currentMonitorGainDb = clamp(gainDb, -60, 0, -18);
    const value = monitorLinearGain(currentMonitorMode, currentMonitorGainDb);
    monitorGain.gain.cancelScheduledValues(context.currentTime);
    monitorGain.gain.setTargetAtTime(value, context.currentTime, 0.01);
    return {
      mode: currentMonitorMode,
      gain_db: currentMonitorGainDb,
      headphones_recommended: currentMonitorMode === "software",
      raw_capture_unchanged: true,
    };
  }

  return {
    contract: "AVANTIQO_MUSIC_RAW_PCM_CAPTURE_V4",
    sample_rate: context.sampleRate,
    browser_processing_disabled: truth.browser_processing_disabled,
    browser_processing_verification: truth.browser_processing_verification,
    requested_browser_processing_disabled: true,
    wav_container_bit_depth: 24,
    capture_sample_size_bits: truth.capture_sample_size_bits,
    native_capture_precision_verified: truth.native_capture_precision_verified,
    effective_capture_precision_known: truth.effective_capture_precision_known,
    device_sample_rate: truth.device_sample_rate,
    device_channel_count: truth.device_channel_count,
    gapless_pass_splitting: true,
    software_monitoring_supported: true,
    software_monitoring_default: "off",
    estimated_capture_latency_seconds: Number(context.baseLatency || 0),
    setMonitor,
    splitPass,
    async stop({ allowEmpty = false } = {}) {
      if (stopped) throw new Error("CREATIVE_MUSIC_RAW_CAPTURE_ALREADY_STOPPED");
      if (splitting) throw new Error("CREATIVE_MUSIC_RAW_CAPTURE_SPLIT_IN_PROGRESS");
      stopped = true;
      try {
        await flush();
        return materializePass({ allowEmpty });
      } finally {
        cleanup();
      }
    },
    cancel() {
      if (stopped) return;
      stopped = true;
      cleanup();
    },
  };
}
