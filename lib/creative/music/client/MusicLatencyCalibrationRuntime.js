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


const CALIBRATION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const STORAGE_KEY = "avantiqo.music.latency-calibration.v1";

function outputSinkId(context) {
  const value = context?.sinkId;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && typeof value.deviceId === "string" && value.deviceId.trim()) return value.deviceId.trim();
  return null;
}

export function evaluateMusicLatencyCalibrationReuse(calibration = {}, current = {}, nowMs = Date.now()) {
  const measuredAt = Date.parse(String(calibration.measured_at || ""));
  const fresh = Number.isFinite(measuredAt) && nowMs - measuredAt >= 0 && nowMs - measuredAt <= CALIBRATION_MAX_AGE_MS;
  const storedInputId = String(calibration.input_device_id || "").trim();
  const currentInputId = String(current.input_device_id || "").trim();
  const storedGroupId = String(calibration.input_group_id || "").trim();
  const currentGroupId = String(current.input_group_id || "").trim();
  const sameInputId = Boolean(storedInputId && currentInputId && storedInputId === currentInputId);
  const sameInputGroup = Boolean(storedGroupId && currentGroupId && storedGroupId === currentGroupId);
  const sameInput = sameInputId || sameInputGroup;
  const sameRate = Number(calibration.sample_rate) > 0 && Number(calibration.sample_rate) === Number(current.sample_rate);
  const samePath = String(calibration.path_type || "") === String(current.path_type || "");
  const storedSink = String(calibration.output_sink_id || "").trim();
  const currentSink = String(current.output_sink_id || "").trim();
  const sinkKnown = Boolean(storedSink && currentSink);
  const sameSink = sinkKnown && storedSink === currentSink;
  const reasons = [];
  if (!fresh) reasons.push("STALE");
  if (!sameInput) reasons.push(storedGroupId && currentGroupId ? "INPUT_HARDWARE_GROUP_CHANGED" : "INPUT_DEVICE_CHANGED");
  if (!sameRate) reasons.push("SAMPLE_RATE_CHANGED");
  if (!samePath) reasons.push("CALIBRATION_PATH_CHANGED");
  if (!sinkKnown) reasons.push("OUTPUT_PATH_UNVERIFIED"); else if (!sameSink) reasons.push("OUTPUT_DEVICE_CHANGED");
  const reuseAllowed = calibration.status === "MEASURED" && calibration.automatic_apply_allowed === true && reasons.length === 0;
  return { reuse_allowed: reuseAllowed, fresh, same_input: sameInput, same_input_id: sameInputId, same_input_group: sameInputGroup, same_sample_rate: sameRate, same_path: samePath, output_path_verified: sinkKnown && sameSink, reasons };
}

export function loadPersistedMusicLatencyCalibration() {
  try { const raw = globalThis.localStorage?.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function persistMusicLatencyCalibration(calibration) {
  try { if (!calibration) return false; globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(calibration)); return true; } catch { return false; }
}

export async function runMusicLatencyCalibration({ deviceId = null, outputDeviceId = null, sampleRate = null, pathType = "HARDWARE_LOOPBACK", hardwareLoopbackConfirmed = false } = {}) {
  if (!navigator.mediaDevices?.getUserMedia || !globalThis.AudioContext || !globalThis.AudioWorkletNode) throw new Error("CREATIVE_MUSIC_LATENCY_CALIBRATION_UNAVAILABLE");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 } }, video: false });
  const context = new AudioContext({ latencyHint: "interactive", ...(Number.isFinite(Number(sampleRate)) && Number(sampleRate) > 0 ? { sampleRate: Number(sampleRate) } : {}) });
  await context.resume();
  let explicitOutputVerified = false;
  if (outputDeviceId) {
    if (typeof context.setSinkId !== "function") throw new Error("CREATIVE_MUSIC_LATENCY_CALIBRATION_OUTPUT_SELECTION_UNSUPPORTED");
    await context.setSinkId(outputDeviceId);
    explicitOutputVerified = outputSinkId(context) === outputDeviceId;
    if (!explicitOutputVerified) throw new Error("CREATIVE_MUSIC_LATENCY_CALIBRATION_OUTPUT_SELECTION_UNVERIFIED");
  }
  await context.audioWorklet.addModule("/audio/avantiqo-pcm-recorder-worklet.js");
  const inputTrack = stream.getAudioTracks?.()?.[0] || null;
  const inputSettings = inputTrack?.getSettings?.() || {};
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
    const scheduledStartTimes = [0.45,0.78,1.11].map((offset)=>context.currentTime+offset);
    const scheduledStartFrames = scheduledStartTimes.map((time)=>Math.round(time*rate));
    for(const scheduledStartTime of scheduledStartTimes){const buffer=context.createBuffer(1,template.length,rate);buffer.copyToChannel(template,0);const output=context.createBufferSource();output.buffer=buffer;output.connect(context.destination);output.start(scheduledStartTime);}
    await new Promise((resolve) => setTimeout(resolve, 1750));
    await new Promise((resolve) => { const timer = setTimeout(resolve, 1000); flushResolve = () => { clearTimeout(timer); resolve(); }; recorder.port.postMessage({ type: "flush" }); });
    const signal = mergeChunks(chunks);
    const captureBaseFrame = Number.isFinite(firstContextFrame) ? firstContextFrame : 0;
    const detections=scheduledStartFrames.map((scheduledFrame)=>{const expectedOffset=Math.max(0,scheduledFrame-captureBaseFrame);const found=detectLatencyCalibrationReturn({signal,template,expectedOffsetFrames:expectedOffset,searchRadiusFrames:Math.round(rate*0.16)});if(!found.detected)return {...found,scheduled_frame:scheduledFrame,latency_frames:null,latency_ms:null};const detectedContextFrame=captureBaseFrame+found.offset_frames,latencyFrames=detectedContextFrame-scheduledFrame,latencyMs=1000*latencyFrames/rate;return {...found,scheduled_frame:scheduledFrame,detected_context_frame:detectedContextFrame,latency_frames:latencyFrames,latency_ms:latencyMs};});
    const valid=detections.filter((row)=>row.detected&&Number.isFinite(row.latency_ms)&&row.latency_ms>=0&&row.latency_ms<=500);
    const direct = String(pathType || "").toUpperCase() === "HARDWARE_LOOPBACK";
    const meanLatency=valid.length?valid.reduce((sum,row)=>sum+row.latency_ms,0)/valid.length:null;
    const maxDeviation=valid.length&&Number.isFinite(meanLatency)?Math.max(...valid.map((row)=>Math.abs(row.latency_ms-meanLatency))):null;
    const minConfidence=valid.length?Math.min(...valid.map((row)=>row.confidence)):0;
    const minSeparation=valid.length?Math.min(...valid.map((row)=>row.peak_separation)):0;
    const repeatabilityPassed=valid.length===scheduledStartFrames.length&&Number.isFinite(maxDeviation)&&maxDeviation<=1.5;
    const confidencePassed=valid.length===scheduledStartFrames.length&&minConfidence>=0.5&&minSeparation>=0.02&&repeatabilityPassed;
    const physicalLoopbackAttested=direct&&hardwareLoopbackConfirmed===true;
    if(!valid.length)return {contract:"AVANTIQO_MUSIC_LATENCY_CALIBRATION_V3",status:"UNVERIFIED",path_type:direct?"HARDWARE_LOOPBACK":"ACOUSTIC_PATH",confidence:0,peak_separation:0,roundtrip_latency_ms:null,automatic_apply_allowed:false,hardware_loopback_confirmed:physicalLoopbackAttested,repeatability_passed:false,calibration_pulse_count:scheduledStartFrames.length,valid_return_count:0,input_device_id:String(inputSettings.deviceId||deviceId||"")||null,input_group_id:String(inputSettings.groupId||"")||null,input_channel_count:finite(inputSettings.channelCount),sample_rate:rate,output_sink_id:outputSinkId(context),output_path_verified:explicitOutputVerified,measured_at:new Date().toISOString(),expires_at:new Date(Date.now()+CALIBRATION_MAX_AGE_MS).toISOString()};
    return {
      contract: "AVANTIQO_MUSIC_LATENCY_CALIBRATION_V3",
      status: confidencePassed ? "MEASURED" : "REVIEW",
      path_type: direct ? "HARDWARE_LOOPBACK" : "ACOUSTIC_PATH",
      sample_rate: rate,
      calibration_pulse_count: scheduledStartFrames.length,
      valid_return_count: valid.length,
      pulse_measurements: detections.map((row)=>({scheduled_output_context_frame:row.scheduled_frame,detected_input_context_frame:row.detected_context_frame??null,roundtrip_latency_ms:Number.isFinite(row.latency_ms)?Number(row.latency_ms.toFixed(3)):null,confidence:row.confidence,peak_separation:row.peak_separation})),
      roundtrip_latency_frames: Number.isFinite(meanLatency)?Math.round(meanLatency*rate/1000):null,
      roundtrip_latency_ms: Number.isFinite(meanLatency)?Number(meanLatency.toFixed(3)):null,
      repeatability_max_deviation_ms:Number.isFinite(maxDeviation)?Number(maxDeviation.toFixed(3)):null,
      repeatability_passed:repeatabilityPassed,
      confidence:minConfidence,
      peak_separation:minSeparation,
      hardware_loopback_confirmed:physicalLoopbackAttested,
      microphone_roundtrip_latency_measured: direct && confidencePassed && physicalLoopbackAttested,
      acoustic_path_latency_measured: !direct && confidencePassed,
      automatic_apply_allowed: direct && confidencePassed && physicalLoopbackAttested,
      input_device_id: String(inputSettings.deviceId || deviceId || "") || null,
      input_group_id: String(inputSettings.groupId || "") || null,
      input_channel_count: finite(inputSettings.channelCount),
      output_sink_id: outputSinkId(context),
      output_path_verified: explicitOutputVerified,
      measured_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + CALIBRATION_MAX_AGE_MS).toISOString(),
      persistence_scope: "LOCAL_BROWSER_HARDWARE_PATH",
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

export const CreativeMusicLatencyCalibrationRuntime = Object.freeze({ run: runMusicLatencyCalibration, detect: detectLatencyCalibrationReturn, evaluateReuse: evaluateMusicLatencyCalibrationReuse, load: loadPersistedMusicLatencyCalibration, persist: persistMusicLatencyCalibration });
