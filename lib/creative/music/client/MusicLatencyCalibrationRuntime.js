function finite(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function createCalibrationSignal(sampleRate, durationSeconds = 0.08) {
  const frames = Math.max(256, Math.round(sampleRate * durationSeconds));
  const data = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    const t = i / sampleRate;
    const progress = i / Math.max(1, frames - 1);
    const frequency = 900 + 5100 * progress;
    const envelope = Math.sin(Math.PI * progress) ** 2;
    data[i] = 0.35 * envelope * Math.sin(2 * Math.PI * frequency * t);
  }
  return data;
}

function normalizedCorrelationAt(signal, template, offset) {
  let dot = 0, signalSq = 0, templateSq = 0;
  const end = Math.min(template.length, signal.length - offset);
  if (end < Math.max(128, Math.round(template.length * 0.8))) return null;
  for (let i = 0; i < end; i += 1) {
    const a = finite(signal[offset + i], 0), b = finite(template[i], 0);
    dot += a * b; signalSq += a * a; templateSq += b * b;
  }
  if (signalSq <= 1e-12 || templateSq <= 1e-12) return null;
  return dot / Math.sqrt(signalSq * templateSq);
}

export function detectLatencyCalibrationReturn({ signal, template, expectedOffsetFrames = 0, searchRadiusFrames = null } = {}) {
  if (!signal?.length || !template?.length) return { detected: false, confidence: 0, offset_frames: null };
  const radius = Math.max(template.length, Math.round(finite(searchRadiusFrames, template.length * 8)));
  const start = Math.max(0, Math.round(expectedOffsetFrames - radius));
  const stop = Math.min(signal.length - Math.max(128, Math.round(template.length * 0.8)), Math.round(expectedOffsetFrames + radius));
  let best = { score: -Infinity, offset: null }, second = { score: -Infinity, offset: null };
  const step = 1;
  for (let offset = start; offset <= stop; offset += step) {
    const score = normalizedCorrelationAt(signal, template, offset);
    if (!Number.isFinite(score)) continue;
    if (score > best.score) { second = best; best = { score, offset }; }
    else if (score > second.score && Math.abs(offset - best.offset) > Math.max(16, Math.round(template.length * 0.1))) second = { score, offset };
  }
  const separation = Number.isFinite(second.score) ? best.score - second.score : best.score;
  const detected = Number.isFinite(best.score) && best.score >= 0.35 && separation >= 0.015;
  return { detected, confidence: Number.isFinite(best.score) ? Number(best.score.toFixed(4)) : 0, peak_separation: Number.isFinite(separation) ? Number(separation.toFixed(4)) : 0, offset_frames: detected ? best.offset : null };
}

function mergeChunks(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(total); let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
  return merged;
}

export async function runMusicLatencyCalibration({ deviceId = null, pathType = "HARDWARE_LOOPBACK" } = {}) {
  if (!navigator.mediaDevices?.getUserMedia || !globalThis.AudioContext || !globalThis.AudioWorkletNode) throw new Error("CREATIVE_MUSIC_LATENCY_CALIBRATION_UNAVAILABLE");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 } }, video: false });
  const context = new AudioContext({ latencyHint: "interactive" });
  await context.resume();
  await context.audioWorklet.addModule("/audio/avantiqo-pcm-recorder-worklet.js");
  const source = context.createMediaStreamSource(stream);
  const recorder = new AudioWorkletNode(context, "avantiqo-pcm-recorder", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
  const silent = context.createGain(); silent.gain.value = 0;
  source.connect(recorder); recorder.connect(silent); silent.connect(context.destination);

  const chunks = []; let firstContextFrame = null; let lastContextFrame = null; let flushResolve = null;
  recorder.port.onmessage = (event) => {
    if (event.data?.type === "pcm" && Array.isArray(event.data.channels)) {
      const channel = new Float32Array(event.data.channels[0] || []);
      if (channel.length) chunks.push(channel);
      const start = Number(event.data.context_frame_start), end = Number(event.data.context_frame_end);
      if (Number.isFinite(start) && !Number.isFinite(firstContextFrame)) firstContextFrame = start;
      if (Number.isFinite(end)) lastContextFrame = end;
    }
    if (event.data?.type === "flushed" && event.data?.reason === "manual") { flushResolve?.(); flushResolve = null; }
  };

  try {
    const rate = context.sampleRate;
    const template = createCalibrationSignal(rate);
    const buffer = context.createBuffer(1, template.length, rate); buffer.copyToChannel(template, 0);
    const output = context.createBufferSource(); output.buffer = buffer; output.connect(context.destination);
    const scheduledStartTime = context.currentTime + 0.45;
    const scheduledStartFrame = Math.round(scheduledStartTime * rate);
    output.start(scheduledStartTime);
    await new Promise((resolve) => setTimeout(resolve, 1300));
    await new Promise((resolve) => { const timer = setTimeout(resolve, 1000); flushResolve = () => { clearTimeout(timer); resolve(); }; recorder.port.postMessage({ type: "flush" }); });
    const signal = mergeChunks(chunks);
    const captureBaseFrame = Number.isFinite(firstContextFrame) ? firstContextFrame : 0;
    const expectedOffset = Math.max(0, scheduledStartFrame - captureBaseFrame);
    const detected = detectLatencyCalibrationReturn({ signal, template, expectedOffsetFrames: expectedOffset, searchRadiusFrames: Math.round(rate * 0.5) });
    if (!detected.detected) return { contract: "AVANTIQO_MUSIC_LATENCY_CALIBRATION_V1", status: "UNVERIFIED", path_type: pathType, confidence: detected.confidence, peak_separation: detected.peak_separation, roundtrip_latency_ms: null, automatic_apply_allowed: false };
    const detectedContextFrame = captureBaseFrame + detected.offset_frames;
    const latencyFrames = detectedContextFrame - scheduledStartFrame;
    const latencyMs = 1000 * latencyFrames / rate;
    const direct = String(pathType || "").toUpperCase() === "HARDWARE_LOOPBACK";
    const confidencePassed = detected.confidence >= 0.5 && detected.peak_separation >= 0.02 && latencyMs >= 0 && latencyMs <= 500;
    return {
      contract: "AVANTIQO_MUSIC_LATENCY_CALIBRATION_V1",
      status: confidencePassed ? "MEASURED" : "REVIEW",
      path_type: direct ? "HARDWARE_LOOPBACK" : "ACOUSTIC_PATH",
      sample_rate: rate,
      scheduled_output_context_frame: scheduledStartFrame,
      detected_input_context_frame: detectedContextFrame,
      roundtrip_latency_frames: latencyFrames,
      roundtrip_latency_ms: Number(latencyMs.toFixed(3)),
      confidence: detected.confidence,
      peak_separation: detected.peak_separation,
      microphone_roundtrip_latency_measured: direct && confidencePassed,
      acoustic_path_latency_measured: !direct && confidencePassed,
      automatic_apply_allowed: direct && confidencePassed,
      recommendation: direct ? "Direct output-to-input loopback" : "Speaker-to-microphone path includes acoustic/device delay",
    };
  } finally {
    try { source.disconnect(); } catch {}
    try { recorder.disconnect(); } catch {}
    try { silent.disconnect(); } catch {}
    stream.getTracks().forEach((track) => track.stop());
    await context.close().catch(() => {});
  }
}

export const CreativeMusicLatencyCalibrationRuntime = Object.freeze({ run: runMusicLatencyCalibration, detect: detectLatencyCalibrationReturn });
