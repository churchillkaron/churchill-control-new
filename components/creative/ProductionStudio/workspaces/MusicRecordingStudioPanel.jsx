"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeMusicCaptureQc } from "@/lib/creative/music/client/MusicCaptureQcRuntime";
import { runMusicRecordingPreflight } from "@/lib/creative/music/client/MusicRecordingPreflightRuntime";
import { CircleStop, Headphones, Mic2, Play, RotateCcw, Save, ShieldCheck, SlidersHorizontal } from "lucide-react";

const TRACK_ROLES = [
  ["vocal", "Vocal"],
  ["guitar", "Guitar"],
  ["bass", "Bass"],
  ["keys", "Keys"],
  ["drums", "Drums"],
  ["instrument", "Instrument"],
  ["room", "Room"],
  ["other", "Other"],
];

function dbfs(value) {
  if (!Number.isFinite(value) || value <= 0) return -Infinity;
  return 20 * Math.log10(value);
}

function formatDb(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} dBFS` : "-∞ dBFS";
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
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
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

function levelStatus(peakDb, rmsDb, clipped) {
  if (clipped || peakDb >= -0.1) return { status: "CLIPPING", action: "Reduce input gain", tone: "text-red-200" };
  if (peakDb > -6 || rmsDb > -12) return { status: "TOO HOT", action: "Reduce input gain slightly", tone: "text-amber-100" };
  if (peakDb < -24 || rmsDb < -36) return { status: "TOO LOW", action: "Increase input gain or move closer", tone: "text-amber-100" };
  return { status: "HEALTHY", action: "Keep current gain", tone: "text-emerald-100" };
}

export default function MusicRecordingStudioPanel({ organizationId, projectId, missionId = null, onSaved, onOpenWorkstation = null }) {
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState("");
  const [trackRole, setTrackRole] = useState("vocal");
  const [title, setTitle] = useState("New recording take");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [meter, setMeter] = useState({ peak: -Infinity, rms: -Infinity, clipped: false });
  const [take, setTake] = useState(null);
  const [saved, setSaved] = useState(null);
  const [quarantineAck, setQuarantineAck] = useState(false);
  const [overrideNote, setOverrideNote] = useState("");
  const [error, setError] = useState("");
  const [recordingPreflight, setRecordingPreflight] = useState(null);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [preflightPhase, setPreflightPhase] = useState("IDLE");

  const streamRef = useRef(null);
  const contextRef = useRef(null);
  const sourceRef = useRef(null);
  const recorderRef = useRef(null);
  const meterRef = useRef(null);
  const sinkRef = useRef(null);
  const chunksRef = useRef([]);
  const statsRef = useRef({ sumSquares: 0, samples: 0, peak: 0, clipped: false });
  const startedAtRef = useRef(0);
  const timerRef = useRef(null);
  const finishResolverRef = useRef(null);
  const continuityRef = useRef({ expectedSequence: 0, expectedFrameStart: 0, chunkGapCount: 0, frameDiscontinuityCount: 0 });
  const captureTruthRef = useRef({ browser_processing_disabled:false, browser_processing_verification:"UNVERIFIED", requested_browser_processing_disabled:true, wav_container_bit_depth:24, capture_sample_size_bits:null, native_capture_precision_verified:false, effective_capture_precision_known:false, device_sample_rate:null, device_channel_count:null });

  const qc = useMemo(() => levelStatus(meter.peak, meter.rms, meter.clipped), [meter]);

  async function request(payload) {
    const response = await fetch("/api/creative/music/auto-studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok || body.success === false) throw new Error(body.error || "Music recording request failed");
    return body;
  }

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const items = (await navigator.mediaDevices.enumerateDevices()).filter((item) => item.kind === "audioinput");
    setDevices(items);
    if (!deviceId && items[0]?.deviceId) setDeviceId(items[0].deviceId);
  }

  useEffect(() => {
    refreshDevices().catch(() => {});
    const media = navigator.mediaDevices;
    const handle = () => refreshDevices().catch(() => {});
    media?.addEventListener?.("devicechange", handle);
    return () => media?.removeEventListener?.("devicechange", handle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cleanupCapture() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    sourceRef.current?.disconnect?.();
    recorderRef.current?.disconnect?.();
    meterRef.current?.disconnect?.();
    sinkRef.current?.disconnect?.();
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    contextRef.current?.close?.().catch(() => {});
    streamRef.current = null;
    contextRef.current = null;
    sourceRef.current = null;
    recorderRef.current = null;
    meterRef.current = null;
    sinkRef.current = null;
  }

  useEffect(() => () => {
    cleanupCapture();
    if (take?.url) URL.revokeObjectURL(take.url);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runPreflight() {
    if (recording || preflightBusy) return;
    setPreflightBusy(true);
    setError("");
    try {
      const result = await runMusicRecordingPreflight({
        deviceId: deviceId || null,
        onLevel: ({ peak_dbfs, rms_dbfs, clipping }) => setMeter({ peak: peak_dbfs, rms: rms_dbfs, clipped: clipping === true }),
        onPhase: setPreflightPhase,
      });
      setRecordingPreflight(result);
    } catch (cause) {
      setRecordingPreflight(null);
      setPreflightPhase("FAILED");
      setError(cause?.message || "Recording preflight failed");
    } finally {
      setPreflightBusy(false);
    }
  }

  async function startRecording() {
    setError("");
    setSaved(null);
    if (!projectId) {
      setError("Open or create a Music project before recording.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext || !window.AudioWorkletNode) {
      setError("This browser does not provide the raw Web Audio recording path required by Avantiqo Music Studio.");
      return;
    }
    setBusy(true);
    try {
      if (take?.url) URL.revokeObjectURL(take.url);
      setTake(null);
      chunksRef.current = [];
      continuityRef.current = { expectedSequence: 0, expectedFrameStart: 0, chunkGapCount: 0, frameDiscontinuityCount: 0 };
      statsRef.current = { sumSquares: 0, samples: 0, peak: 0, clipped: false };
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
      streamRef.current = stream;
      const settings = stream.getAudioTracks?.()?.[0]?.getSettings?.() || {};
      const processingStates = [settings.echoCancellation, settings.noiseSuppression, settings.autoGainControl];
      const knownProcessing = processingStates.filter((value) => typeof value === "boolean");
      const processingDisabled = knownProcessing.length === 3 && knownProcessing.every((value) => value === false);
      const processingPresent = knownProcessing.some((value) => value === true);
      const sampleSize = Number(settings.sampleSize);
      captureTruthRef.current = {
        browser_processing_disabled: processingDisabled,
        browser_processing_verification: processingPresent ? "PROCESSING_PRESENT" : processingDisabled ? "VERIFIED_DISABLED" : knownProcessing.length ? "PARTIAL" : "UNVERIFIED",
        requested_browser_processing_disabled: true,
        wav_container_bit_depth: 24,
        capture_sample_size_bits: Number.isFinite(sampleSize) ? sampleSize : null,
        native_capture_precision_verified: Number.isFinite(sampleSize) && sampleSize === 24,
        effective_capture_precision_known: Number.isFinite(sampleSize),
        device_sample_rate: Number.isFinite(Number(settings.sampleRate)) ? Number(settings.sampleRate) : null,
        device_channel_count: Number.isFinite(Number(settings.channelCount)) ? Number(settings.channelCount) : null,
      };
      await refreshDevices();

      const context = new AudioContext({ latencyHint: "interactive" });
      contextRef.current = context;
      const deviceRate = Number(captureTruthRef.current.device_sample_rate);
      const contextRate = Number(context.sampleRate);
      const deviceRateKnown = Number.isFinite(deviceRate) && deviceRate > 0;
      const contextRateKnown = Number.isFinite(contextRate) && contextRate > 0;
      const sampleRateMismatch = deviceRateKnown && contextRateKnown && Math.abs(deviceRate - contextRate) >= 1;
      captureTruthRef.current = {
        ...captureTruthRef.current,
        audio_context_sample_rate: contextRateKnown ? contextRate : null,
        sample_rate_conversion_detected: sampleRateMismatch,
        native_sample_rate_path_verified: deviceRateKnown && contextRateKnown && !sampleRateMismatch,
        sample_rate_path_verification: !deviceRateKnown || !contextRateKnown ? "UNVERIFIED" : sampleRateMismatch ? "RESAMPLED" : "MATCHED",
      };
      await context.audioWorklet.addModule("/audio/avantiqo-pcm-recorder-worklet.js");
      const source = context.createMediaStreamSource(stream);
      sourceRef.current = source;
      const reportedInputChannels = Number(captureTruthRef.current.device_channel_count);
      const recorderChannels = Number.isFinite(reportedInputChannels) && reportedInputChannels > 0
        ? Math.min(2, Math.max(1, Math.round(reportedInputChannels)))
        : Math.min(2, Math.max(1, source.channelCount || 1));
      captureTruthRef.current = {
        ...captureTruthRef.current,
        recorder_channel_count_requested: recorderChannels,
        channel_topology_source: Number.isFinite(reportedInputChannels) && reportedInputChannels > 0 ? "MEDIA_TRACK_SETTINGS" : "MEDIA_STREAM_SOURCE_FALLBACK",
      };
      const recorder = new AudioWorkletNode(context, "avantiqo-pcm-recorder", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [recorderChannels],
      });
      recorderRef.current = recorder;
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      meterRef.current = analyser;
      const sink = context.createGain();
      sink.gain.value = 0;
      sinkRef.current = sink;
      source.connect(recorder);
      source.connect(analyser);
      recorder.connect(sink);
      sink.connect(context.destination);

      recorder.port.onmessage = (event) => {
        if (event.data?.type === "pcm" && Array.isArray(event.data.channels)) {
          const continuity = continuityRef.current;
          const sequence = Number(event.data.sequence), frameStart = Number(event.data.frame_start), frameEnd = Number(event.data.frame_end), frames = Number(event.data.frames);
          if (!Number.isFinite(sequence) || sequence !== continuity.expectedSequence) continuity.chunkGapCount += 1;
          if (!Number.isFinite(frameStart) || frameStart !== continuity.expectedFrameStart || !Number.isFinite(frameEnd) || !Number.isFinite(frames) || frameEnd - frameStart !== frames) continuity.frameDiscontinuityCount += 1;
          continuity.expectedSequence = Number.isFinite(sequence) ? sequence + 1 : continuity.expectedSequence + 1;
          continuity.expectedFrameStart = Number.isFinite(frameEnd) ? frameEnd : continuity.expectedFrameStart + Math.max(0, Number.isFinite(frames) ? frames : 0);
          const channels = event.data.channels.map((value) => new Float32Array(value));
          if (!chunksRef.current.length) chunksRef.current = channels.map(() => []);
          channels.forEach((chunk, index) => chunksRef.current[index]?.push(chunk));
          for (const chunk of channels) {
            for (let i = 0; i < chunk.length; i += 1) {
              const value = chunk[i];
              const abs = Math.abs(value);
              statsRef.current.peak = Math.max(statsRef.current.peak, abs);
              statsRef.current.sumSquares += value * value;
              statsRef.current.samples += 1;
              if (abs >= 0.999) statsRef.current.clipped = true;
            }
          }
        }
        if (event.data?.type === "flushed" && event.data?.reason === "manual") {
          finishResolverRef.current?.();
          finishResolverRef.current = null;
        }
      };

      startedAtRef.current = performance.now();
      setElapsed(0);
      setMeter({ peak: -Infinity, rms: -Infinity, clipped: false });
      setRecording(true);
      const timeData = new Float32Array(analyser.fftSize);
      timerRef.current = setInterval(() => {
        analyser.getFloatTimeDomainData(timeData);
        let peak = 0;
        let sumSquares = 0;
        for (let i = 0; i < timeData.length; i += 1) {
          const value = timeData[i];
          peak = Math.max(peak, Math.abs(value));
          sumSquares += value * value;
        }
        const rms = Math.sqrt(sumSquares / timeData.length);
        setMeter((current) => ({
          peak: dbfs(peak),
          rms: dbfs(rms),
          clipped: current.clipped || peak >= 0.999,
        }));
        setElapsed((performance.now() - startedAtRef.current) / 1000);
      }, 100);
    } catch (cause) {
      cleanupCapture();
      setError(cause?.message || "Recording could not start");
    } finally {
      setBusy(false);
    }
  }

  async function stopRecording() {
    if (!recording || !recorderRef.current || !contextRef.current) return;
    setBusy(true);
    setRecording(false);
    try {
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 1000);
        finishResolverRef.current = () => {
          clearTimeout(timeout);
          resolve();
        };
        recorderRef.current.port.postMessage({ type: "flush" });
      });
      const context = contextRef.current;
      const channels = mergeChannels(chunksRef.current);
      if (!channels[0]?.length) throw new Error("No audio frames were captured.");
      const blob = encodeWav24(channels, context.sampleRate);
      const duration = channels[0].length / context.sampleRate;
      const stats = statsRef.current;
      const peak = dbfs(stats.peak);
      const rms = dbfs(Math.sqrt(stats.sumSquares / Math.max(1, stats.samples)));
      const clipped = stats.clipped || peak >= -0.1;
      const captureQc = analyzeMusicCaptureQc(channels, context.sampleRate, { chunk_gap_count: continuityRef.current.chunkGapCount, frame_discontinuity_count: continuityRef.current.frameDiscontinuityCount, expected_frame_count: continuityRef.current.expectedFrameStart });
      const resultQc = levelStatus(peak, rms, clipped);
      const url = URL.createObjectURL(blob);
      setTake({ blob, url, duration, sampleRate: context.sampleRate, channels: channels.length, peak, rms, clipped, qc: resultQc.status, captureQc, recorded_channel_count: channels.length, channel_topology_verified: Number.isFinite(Number(captureTruthRef.current.device_channel_count)) ? Number(captureTruthRef.current.device_channel_count) === channels.length : null, ...captureTruthRef.current });
      setMeter({ peak, rms, clipped });
      setElapsed(duration);
    } catch (cause) {
      setError(cause?.message || "Recording could not be finalized");
    } finally {
      cleanupCapture();
      setBusy(false);
    }
  }

  function discardTake() {
    if (take?.url) URL.revokeObjectURL(take.url);
    setTake(null);
    setSaved(null);
    setElapsed(0);
    setMeter({ peak: -Infinity, rms: -Infinity, clipped: false });
    chunksRef.current = [];
  }

  async function saveTake() {
    if (!take || !organizationId || !projectId) return;
    setBusy(true);
    setError("");
    try {
      const safeTitle = (title || "recording-take").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "recording-take";
      const fileName = `${safeTitle}.wav`;
      const target = await request({
        action: "prepare_source_upload",
        organization_id: organizationId,
        file_name: fileName,
        size_bytes: take.blob.size,
        content_type: "audio/wav",
      });
      const upload = await fetch(target.upload_url, {
        method: "PUT",
        headers: { "Content-Type": "audio/wav" },
        body: take.blob,
      });
      if (!upload.ok) throw new Error(`Recording upload failed (${upload.status})`);
      const registered = await request({
        action: "register_recorded_take",
        organization_id: organizationId,
        creative_project_id: projectId,
        creative_mission_id: missionId,
        storage_reference: target.storage_reference,
        file_name: fileName,
        title,
        track_role: trackRole,
        duration_seconds: take.duration,
        sample_rate: take.sampleRate,
        channels: take.channels,
        peak_dbfs: take.peak,
        rms_dbfs: take.rms,
        clipping_detected: take.clipped,
        recording_qc_status: take.captureQc?.status || take.qc,
        capture_qc: take.captureQc || null,
        headroom_db: take.captureQc?.headroom_db ?? null,
        crest_factor_db: take.captureQc?.crest_factor_db ?? null,
        dc_offset: take.captureQc?.dc_offset ?? null,
        background_floor_estimate_dbfs: take.captureQc?.background_floor_estimate_dbfs ?? null,
        channel_imbalance_db: take.captureQc?.channel_imbalance_db ?? null,
        stereo_correlation: take.captureQc?.stereo_correlation ?? null,
        mono_fold_down_loss_db: take.captureQc?.mono_fold_down_loss_db ?? null,
        stereo_phase_risk: take.captureQc?.stereo_phase_risk === true,
        mono_collapse_risk: take.captureQc?.mono_collapse_risk === true,
        chunk_gap_count: take.captureQc?.chunk_gap_count ?? 0,
        frame_discontinuity_count: take.captureQc?.frame_discontinuity_count ?? 0,
        capture_continuity_verified: take.captureQc?.capture_continuity_verified === true,
        browser_processing_disabled: take.browser_processing_disabled === true,
        browser_processing_verification: take.browser_processing_verification || "UNVERIFIED",
        requested_browser_processing_disabled: take.requested_browser_processing_disabled === true,
        wav_container_bit_depth: take.wav_container_bit_depth || 24,
        capture_sample_size_bits: take.capture_sample_size_bits ?? null,
        native_capture_precision_verified: take.native_capture_precision_verified === true,
        effective_capture_precision_known: take.effective_capture_precision_known === true,
        device_sample_rate: take.device_sample_rate ?? null,
        device_channel_count: take.device_channel_count ?? null,
        recorder_channel_count_requested: take.recorder_channel_count_requested ?? null,
        recorded_channel_count: take.recorded_channel_count ?? take.channels ?? null,
        channel_topology_source: take.channel_topology_source || "UNVERIFIED",
        channel_topology_verified: take.channel_topology_verified === true,
        audio_context_sample_rate: take.audio_context_sample_rate ?? take.sampleRate ?? null,
        sample_rate_conversion_detected: take.sample_rate_conversion_detected === true,
        native_sample_rate_path_verified: take.native_sample_rate_path_verified === true,
        sample_rate_path_verification: take.sample_rate_path_verification || "UNVERIFIED",
        source_rights_confirmed: true,
      });
      setSaved(registered);
      onSaved?.(registered.asset, registered.multitrack || null);
    } catch (cause) {
      setError(cause?.message || "Recording could not be saved");
    } finally {
      setBusy(false);
    }
  }

  async function promoteQuarantinedTake() {
    if (!saved?.asset?.id || saved.quarantined_from_active_multitrack !== true || !quarantineAck) return;
    setBusy(true);
    setError("");
    try {
      const promoted = await request({
        action: "promote_quarantined_take",
        organization_id: organizationId,
        creative_project_id: projectId,
        asset_id: saved.asset.id,
        expected_revision: saved.current_multitrack_revision,
        acknowledge_quarantine_reasons: true,
        override_note: overrideNote.trim() || null,
        track_name: title,
        timeline_start_seconds: 0,
      });
      const nextSaved = {
        ...saved,
        multitrack: promoted.multitrack,
        added_to_multitrack: true,
        quarantined_from_active_multitrack: false,
        quarantine_override_applied: true,
        current_multitrack_revision: promoted.promoted_revision,
      };
      setSaved(nextSaved);
      onSaved?.(saved.asset, promoted.multitrack);
    } catch (cause) {
      setError(cause?.message || "Quarantined take could not be promoted");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-7xl p-6">
      <div className="overflow-hidden rounded-3xl border border-[#d6a66a]/20 bg-gradient-to-b from-[#d6a66a]/[0.06] to-black/30">
        <div className="border-b border-white/7 p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#d6a66a]">Recording Studio</div>
              <h2 className="mt-3 text-2xl font-medium text-white/90">Capture the performance cleanly first</h2>
              <p className="mt-2 max-w-3xl text-xs leading-5 text-white/38">Avantiqo requests browser echo cancellation, noise suppression and automatic gain control off, records the browser PCM stream without Avantiqo DSP, and preserves it in a 24-bit WAV container. Device/ADC precision is reported separately and is only called 24-bit when the browser exposes that proof.</p>
            </div>
            <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.04] px-4 py-3 text-[10px] text-emerald-100/60">
              <ShieldCheck className="mb-1 h-4 w-4" /> Original take preserved
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[0.82fr_1.18fr]">
          <div className="space-y-4">
            <label className="block"><div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-white/30">Take name</div><input value={title} onChange={(event) => setTitle(event.target.value)} disabled={recording} className="w-full rounded-xl border border-white/8 bg-black/30 px-4 py-3 text-sm text-white/75 outline-none" /></label>
            <label className="block"><div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-white/30">Track role</div><select value={trackRole} onChange={(event) => setTrackRole(event.target.value)} disabled={recording} className="w-full rounded-xl border border-white/8 bg-[#0a0a09] px-4 py-3 text-sm text-white/70 outline-none">{TRACK_ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="block"><div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-white/30">Input device</div><select value={deviceId} onChange={(event) => { setDeviceId(event.target.value); setRecordingPreflight(null); setPreflightPhase("IDLE"); }} disabled={recording || preflightBusy} className="w-full rounded-xl border border-white/8 bg-[#0a0a09] px-4 py-3 text-sm text-white/70 outline-none"><option value="">System default</option>{devices.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Audio input ${index + 1}`}</option>)}</select></label>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/7 bg-black/25 p-3"><div className="text-[9px] uppercase tracking-[0.14em] text-white/25">Capture</div><div className="mt-1 text-xs text-white/65">24-bit WAV container · raw PCM path</div></div>
              <div className="rounded-xl border border-white/7 bg-black/25 p-3"><div className="text-[9px] uppercase tracking-[0.14em] text-white/25">Monitoring</div><div className="mt-1 text-xs text-white/65">Meter only · no feedback</div></div>
            </div>

            <div className="flex gap-2">
              {!recording ? <button type="button" disabled={busy || preflightBusy} onClick={runPreflight} className="rounded-xl border border-[#d6a66a]/20 bg-[#d6a66a]/[0.06] px-4 py-3 text-xs font-medium text-[#efd29f]/80 disabled:opacity-40">{preflightBusy ? preflightPhase === "ROOM_TONE" ? "Room tone…" : preflightPhase === "PERFORMANCE_LEVEL" ? "Perform…" : "Checking…" : "Run preflight"}</button> : null}
              {!recording ? <button type="button" disabled={busy || preflightBusy} onClick={startRecording} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#d6a66a] px-4 py-3 text-sm font-semibold text-black disabled:opacity-40"><Mic2 className="h-4 w-4" />Record</button> : <button type="button" disabled={busy} onClick={stopRecording} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-300/25 bg-red-400/10 px-4 py-3 text-sm font-medium text-red-100"><CircleStop className="h-4 w-4" />Stop</button>}
              {take && !recording ? <button type="button" disabled={busy} onClick={discardTake} className="rounded-xl border border-white/9 px-4 py-3 text-white/45"><RotateCcw className="h-4 w-4" /></button> : null}
            </div>
            {recordingPreflight ? <div className={`rounded-xl border px-4 py-3 text-[10px] ${recordingPreflight.status === "READY" ? "border-emerald-300/15 bg-emerald-300/[0.03] text-emerald-100/65" : recordingPreflight.status === "NOT_READY" ? "border-red-300/15 bg-red-300/[0.03] text-red-100/65" : "border-amber-300/15 bg-amber-300/[0.03] text-amber-100/65"}`}><div className="font-medium">Preflight {recordingPreflight.status}</div><div className="mt-1 leading-4 opacity-70">Peak {Number.isFinite(recordingPreflight.measurements?.peak_dbfs) ? `${recordingPreflight.measurements.peak_dbfs.toFixed(1)} dBFS` : "—"} · floor {Number.isFinite(recordingPreflight.measurements?.background_floor_estimate_dbfs) ? `${recordingPreflight.measurements.background_floor_estimate_dbfs.toFixed(1)} dBFS` : "—"} · phase {Number.isFinite(recordingPreflight.measurements?.stereo_correlation) ? recordingPreflight.measurements.stereo_correlation.toFixed(2) : "—"}</div>{recordingPreflight.blockers?.length || recordingPreflight.reviews?.length ? <div className="mt-1 leading-4 opacity-70">{[...(recordingPreflight.blockers || []), ...(recordingPreflight.reviews || [])].join(" · ")}</div> : null}<div className="mt-1 opacity-50">4-second diagnostic only · room tone first, then perform at real level · nothing saved</div></div> : null}
            {error ? <div className="rounded-xl border border-red-400/15 bg-red-400/[0.05] px-4 py-3 text-xs text-red-200/70">{error}</div> : null}
          </div>

          <div className="rounded-2xl border border-white/8 bg-black/25 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4"><div><div className="text-[9px] uppercase tracking-[0.18em] text-white/28">Engineering meter</div><div className={`mt-1 text-sm font-medium ${qc.tone}`}>{qc.status}</div></div><div className="text-right"><div className="font-mono text-2xl text-white/78">{elapsed.toFixed(1)}s</div><div className="text-[9px] uppercase tracking-[0.14em] text-white/24">{qc.action}</div></div></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/7 p-4"><div className="text-[9px] uppercase tracking-[0.14em] text-white/25">Peak</div><div className="mt-2 font-mono text-lg text-white/72">{formatDb(meter.peak)}</div><div className="mt-1 text-[9px] text-white/24">Target ≈ -18 to -6 dBFS</div></div>
              <div className="rounded-xl border border-white/7 p-4"><div className="text-[9px] uppercase tracking-[0.14em] text-white/25">RMS</div><div className="mt-2 font-mono text-lg text-white/72">{formatDb(meter.rms)}</div><div className="mt-1 text-[9px] text-white/24">Stable recording energy</div></div>
              <div className="rounded-xl border border-white/7 p-4"><div className="text-[9px] uppercase tracking-[0.14em] text-white/25">Clipping</div><div className={`mt-2 text-lg font-medium ${meter.clipped ? "text-red-200" : "text-emerald-100/70"}`}>{meter.clipped ? "Detected" : "Clear"}</div><div className="mt-1 text-[9px] text-white/24">Never repair at capture if avoidable</div></div>{take?.captureQc ? <div className="rounded-xl border border-white/7 p-4"><div className="text-[9px] uppercase tracking-[0.14em] text-white/25">Take QC</div><div className="mt-2 text-sm font-medium text-white/65">{take.captureQc.status}</div><div className="mt-1 text-[9px] leading-4 text-white/28">HR {Number.isFinite(take.captureQc.headroom_db) ? `${take.captureQc.headroom_db.toFixed(1)} dB` : "—"} · crest {Number.isFinite(take.captureQc.crest_factor_db) ? `${take.captureQc.crest_factor_db.toFixed(1)} dB` : "—"} · floor {Number.isFinite(take.captureQc.background_floor_estimate_dbfs) ? `${take.captureQc.background_floor_estimate_dbfs.toFixed(1)} dBFS` : "—"} · DC {Number.isFinite(take.captureQc.dc_offset) ? take.captureQc.dc_offset.toFixed(4) : "—"} · hum {take.captureQc.hum_warning ? `${take.captureQc.dominant_hum_hz} Hz` : take.captureQc.hum_measurement_confidence === "UNVERIFIED_NO_QUIET_WINDOWS" ? "unverified" : "clear"}</div><div className={`mt-1 text-[9px] leading-4 ${take.captureQc.stereo_phase_risk || take.captureQc.mono_collapse_risk ? "text-amber-100/65" : "text-white/24"}`}>Phase {take.captureQc.stereo_phase_measured ? `corr ${Number.isFinite(take.captureQc.stereo_correlation) ? take.captureQc.stereo_correlation.toFixed(2) : "—"} · mono Δ ${Number.isFinite(take.captureQc.mono_fold_down_loss_db) ? `${take.captureQc.mono_fold_down_loss_db.toFixed(1)} dB` : "—"}` : "mono/unmeasured"}{take.captureQc.stereo_phase_risk ? " · phase risk" : ""}{take.captureQc.mono_collapse_risk ? " · mono collapse risk" : ""}</div></div> : null}
            </div>

            {take ? <div className="mt-5 rounded-2xl border border-[#d6a66a]/15 bg-[#d6a66a]/[0.035] p-4"><div className="flex items-center gap-2 text-xs text-[#efd29f]/75"><Play className="h-4 w-4" /> Recorded take · {take.sampleRate} Hz · {take.channels}ch · 24-bit WAV container · input precision {take.capture_sample_size_bits ? `${take.capture_sample_size_bits}-bit reported` : "not reported"} · rate path {take.sample_rate_path_verification || "UNVERIFIED"} · channel path {take.channel_topology_verified === true ? "MATCHED" : take.channel_topology_verified === false ? "MISMATCH" : "UNVERIFIED"}</div><audio src={take.url} controls className="mt-3 w-full" /><button type="button" disabled={busy || Boolean(saved)} onClick={saveTake} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#d6a66a]/25 bg-[#d6a66a]/10 px-4 py-3 text-xs font-medium text-[#efd29f] disabled:opacity-40"><Save className="h-4 w-4" />{saved ? "Original take saved" : busy ? "Saving…" : "Save original take to project"}</button></div> : <div className="mt-5 flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-white/8 text-center"><div><Headphones className="mx-auto h-6 w-6 text-white/15" /><div className="mt-2 text-xs text-white/28">Set gain while watching the meter, then record.</div></div></div>}

            {saved?.quarantined_from_active_multitrack === true ? <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] px-4 py-4 text-xs text-amber-100/75">
              <div className="font-medium"><ShieldCheck className="mr-2 inline h-4 w-4" />Original take preserved, but quarantined from the active multitrack.</div>
              <div className="mt-2 text-[10px] leading-4 text-amber-100/55">QC reasons: {(saved.quarantine_reasons || []).join(", ") || "Capture QC requires review"}. The file is preserved unchanged. Promoting it is an explicit override.</div>
              <label className="mt-3 flex items-start gap-2 text-[10px] text-amber-100/65"><input type="checkbox" checked={quarantineAck} onChange={(event) => setQuarantineAck(event.target.checked)} className="mt-0.5" /><span>I reviewed the quarantine reasons and intentionally want this take in the active session.</span></label>
              <textarea value={overrideNote} onChange={(event) => setOverrideNote(event.target.value)} placeholder="Optional reason for override" className="mt-3 min-h-16 w-full rounded-lg border border-amber-200/15 bg-black/25 px-3 py-2 text-[10px] text-white/65 outline-none" />
              <div className="mt-2 text-[9px] text-amber-100/40">Current workstation revision {saved.current_multitrack_revision ?? "—"}. Promotion is revision-safe and permanently audited.</div>
              <button type="button" disabled={busy || !quarantineAck} onClick={promoteQuarantinedTake} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-200/25 bg-amber-200/10 px-3 py-2 text-[10px] font-medium text-amber-100 disabled:opacity-35"><SlidersHorizontal className="h-3.5 w-3.5" />{busy ? "Promoting…" : "Promote quarantined take"}</button>
            </div> : saved ? <div className="mt-4 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.04] px-4 py-3 text-xs text-emerald-100/65">
              <div><ShieldCheck className="mr-2 inline h-4 w-4" />Original take preserved and added to the multitrack timeline.</div>
              <div className="mt-1 text-[10px] text-emerald-100/45">Revision {saved.multitrack?.revision ?? "—"} · track {saved.multitrack?.track_id || "ready"} · clip {saved.multitrack?.clip_id || "ready"}</div>
              {onOpenWorkstation ? <button type="button" onClick={onOpenWorkstation} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#d6a66a]/25 bg-[#d6a66a]/10 px-3 py-2 text-[10px] font-medium text-[#efd29f]"><SlidersHorizontal className="h-3.5 w-3.5" />Open Workstation</button> : null}
            </div> : null}
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-white/7 bg-white/[0.015] p-4"><SlidersHorizontal className="mt-0.5 h-4 w-4 shrink-0 text-[#d6a66a]/60" /><div className="text-[10px] leading-4 text-white/30">Healthy and reviewable takes enter the multitrack timeline. Retake-required captures stay preserved but quarantined until a human explicitly acknowledges the QC reasons and promotes them.</div></div>
          </div>
        </div>
      </div>
    </section>
  );
}
