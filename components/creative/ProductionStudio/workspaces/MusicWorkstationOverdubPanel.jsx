"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CircleStop, Headphones, Mic2, Radio, ShieldCheck } from "lucide-react";

import { startMusicRawPcmCapture } from "@/lib/creative/music/client/MusicRawPcmCapture";
import { startMusicMultitrackPreview } from "@/lib/creative/music/client/MusicMultitrackPreviewEngine";
import MusicTakeLaneCompPanel from "./MusicTakeLaneCompPanel";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function beatsPerBar(signature = "4/4") {
  const numerator = Number(String(signature).split("/")[0]);
  return Number.isFinite(numerator) && numerator > 0 ? numerator : 4;
}

function trackRole(type) {
  return ["vocal", "guitar", "bass", "keys", "drums", "instrument"].includes(type) ? type : "other";
}

function formatDb(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} dBFS` : "-∞ dBFS";
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function playCountIn({ bpm, bars, signature }) {
  if (!bars) return;
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) {
    await sleep(bars * beatsPerBar(signature) * (60_000 / bpm));
    return;
  }
  const context = new AudioContextClass({ latencyHint: "interactive" });
  await context.resume();
  const beats = bars * beatsPerBar(signature);
  const secondsPerBeat = 60 / bpm;
  const start = context.currentTime + 0.03;
  for (let index = 0; index < beats; index += 1) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const downbeat = index % beatsPerBar(signature) === 0;
    oscillator.frequency.value = downbeat ? 1320 : 880;
    gain.gain.setValueAtTime(0.0001, start + index * secondsPerBeat);
    gain.gain.exponentialRampToValueAtTime(downbeat ? 0.18 : 0.1, start + index * secondsPerBeat + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + index * secondsPerBeat + 0.045);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start + index * secondsPerBeat);
    oscillator.stop(start + index * secondsPerBeat + 0.05);
  }
  await sleep((beats * secondsPerBeat + 0.06) * 1000);
  await context.close().catch(() => {});
}

export default function MusicWorkstationOverdubPanel({
  organizationId,
  projectId,
  session,
  assetUrls,
  selectedTrack,
  playhead,
  loopEnabled,
  loopStart,
  loopEnd,
  onReload,
  onRecordingChange,
}) {
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState("");
  const [countInBars, setCountInBars] = useState(1);
  const [punchEnabled, setPunchEnabled] = useState(false);
  const [punchStart, setPunchStart] = useState(0);
  const [punchEnd, setPunchEnd] = useState(8);
  const [loopPasses, setLoopPasses] = useState(3);
  const [latencyCompMs, setLatencyCompMs] = useState(0);
  const [recording, setRecording] = useState(false);
  const [phase, setPhase] = useState("IDLE");
  const [meter, setMeter] = useState({ peak_dbfs: -Infinity, rms_dbfs: -Infinity, clipping: false });
  const [error, setError] = useState("");
  const [savedPasses, setSavedPasses] = useState(0);
  const captureRef = useRef(null);
  const backingRef = useRef(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices?.().then((items) => {
      const inputs = items.filter((item) => item.kind === "audioinput");
      setDevices(inputs);
      if (!deviceId && inputs[0]?.deviceId) setDeviceId(inputs[0].deviceId);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPunchStart(Math.max(0, finite(playhead, 0)));
    setPunchEnd(Math.max(finite(playhead, 0) + 1, finite(loopEnd, finite(playhead, 0) + 8)));
  }, [playhead, loopEnd]);

  useEffect(() => () => {
    cancelledRef.current = true;
    captureRef.current?.cancel?.();
    backingRef.current?.stop?.();
  }, []);

  const armed = selectedTrack?.armed === true;
  const bpm = Math.max(30, Math.min(300, finite(session?.bpm, 96)));
  const signature = session?.time_signature || "4/4";
  const region = useMemo(() => {
    if (loopEnabled) return { start: Math.max(0, finite(loopStart, 0)), end: Math.max(finite(loopStart, 0) + 0.1, finite(loopEnd, 0)), mode: "LOOP_TAKES" };
    if (punchEnabled) return { start: Math.max(0, finite(punchStart, playhead)), end: Math.max(finite(punchStart, playhead) + 0.1, finite(punchEnd, punchStart + 1)), mode: "PUNCH_IN_OUT" };
    return { start: Math.max(0, finite(playhead, 0)), end: null, mode: "OVERDUB" };
  }, [loopEnabled, loopStart, loopEnd, punchEnabled, punchStart, punchEnd, playhead]);

  async function request(payload) {
    const response = await fetch("/api/creative/music/auto-studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok || body.success === false) throw new Error(body.error || "Music overdub request failed");
    return body;
  }

  async function saveMultitrackSession(nextSession, errorCode) {
    const response = await fetch("/api/creative/music/multitrack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save",
        organization_id: organizationId,
        creative_project_id: projectId,
        session: nextSession,
      }),
    });
    const body = await response.json();
    if (!response.ok || body.success === false) {
      throw new Error(body.error || errorCode);
    }
    return body;
  }

  async function persistWorkstationBeforeRecording() {
    const submitted = structuredClone(session);
    submitted.timeline = {
      ...(submitted.timeline || {}),
      playhead_seconds: playhead,
      loop_enabled: loopEnabled,
      loop_start_seconds: loopStart,
      loop_end_seconds: loopEnd,
    };
    return saveMultitrackSession(submitted, "CREATIVE_MUSIC_OVERDUB_PRE_RECORD_SAVE_FAILED");
  }

  async function persistCompTrack(nextTrack) {
    if (!session || !nextTrack?.id) return;
    setError("");
    try {
      const submitted = structuredClone(session);
      const index = submitted.tracks.findIndex((track) => track.id === nextTrack.id);
      if (index < 0) throw new Error("CREATIVE_MUSIC_COMP_TRACK_NOT_FOUND");
      submitted.tracks[index] = nextTrack;
      submitted.timeline = {
        ...(submitted.timeline || {}),
        playhead_seconds: playhead,
        loop_enabled: loopEnabled,
        loop_start_seconds: loopStart,
        loop_end_seconds: loopEnd,
      };
      await saveMultitrackSession(submitted, "CREATIVE_MUSIC_COMP_SAVE_FAILED");
      await onReload?.();
    } catch (cause) {
      setError(cause?.message || "Comp change could not be saved");
    }
  }

  async function savePass(take, passIndex, startSeconds) {
    const base = `${selectedTrack?.name || "track"}-take-${String(Date.now()).slice(-6)}-${passIndex + 1}`
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || `overdub-${passIndex + 1}`;
    const fileName = `${base}.wav`;
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
    if (!upload.ok) throw new Error(`CREATIVE_MUSIC_OVERDUB_UPLOAD_${upload.status}`);
    const latencyCompensationSeconds = Math.max(-0.5, Math.min(0.5, finite(latencyCompMs, 0) / 1000));
    const compensatedStart = Math.max(0, startSeconds - latencyCompensationSeconds);
    return request({
      action: "register_recorded_take",
      organization_id: organizationId,
      creative_project_id: projectId,
      storage_reference: target.storage_reference,
      file_name: fileName,
      title: `${selectedTrack?.name || "Track"} Take ${passIndex + 1}`,
      track_role: trackRole(selectedTrack?.type),
      duration_seconds: take.duration_seconds,
      sample_rate: take.sample_rate,
      channels: take.channels,
      peak_dbfs: take.peak_dbfs,
      rms_dbfs: take.rms_dbfs,
      clipping_detected: take.clipping === true,
      recording_qc_status: take.clipping === true ? "CLIPPING" : "CAPTURED",
      browser_processing_disabled: true,
      source_rights_confirmed: true,
      multitrack_track_id: selectedTrack.id,
      timeline_start_seconds: compensatedStart,
      capture_base_latency_seconds: take.capture_base_latency_seconds || 0,
      latency_compensation_seconds: latencyCompensationSeconds,
      overdub_mode: region.mode,
      overdub_pass_index: passIndex,
    });
  }

  async function startBacking(startSeconds, stopAtSeconds) {
    backingRef.current?.stop?.();
    const backing = await startMusicMultitrackPreview({
      session,
      assetUrls,
      startSeconds,
      stopAtSeconds,
    });
    backingRef.current = backing;
    return backing;
  }

  async function begin() {
    if (!selectedTrack || !armed || recording) return;
    if (!organizationId || !projectId) return;
    if (loopEnabled && region.end <= region.start) return;
    cancelledRef.current = false;
    setError("");
    setSavedPasses(0);
    try {
      setPhase("SAVING PROJECT");
      await persistWorkstationBeforeRecording();
      setRecording(true);
      onRecordingChange?.(true);

      setPhase("OPENING INPUT");
      const capture = await startMusicRawPcmCapture({
        deviceId: deviceId || null,
        onLevel: setMeter,
      });
      captureRef.current = capture;

      setPhase("COUNT-IN");
      await playCountIn({ bpm, bars: countInBars, signature });
      if (cancelledRef.current) return;

      await capture.splitPass({ allowEmpty: true });

      if (loopEnabled) {
        const passDuration = region.end - region.start;
        for (let passIndex = 0; passIndex < loopPasses; passIndex += 1) {
          if (cancelledRef.current) break;
          setPhase(`RECORDING PASS ${passIndex + 1}/${loopPasses}`);
          await startBacking(region.start, region.end);
          await sleep(passDuration * 1000);
          backingRef.current?.stop?.();
          backingRef.current = null;
          const pass = passIndex === loopPasses - 1
            ? await capture.stop()
            : await capture.splitPass();
          if (pass) {
            setPhase(`SAVING PASS ${passIndex + 1}`);
            await savePass(pass, passIndex, region.start);
            setSavedPasses(passIndex + 1);
          }
        }
      } else {
        setPhase(region.mode === "PUNCH_IN_OUT" ? "PUNCH RECORDING" : "OVERDUB RECORDING");
        await startBacking(region.start, region.end);
        if (region.end !== null) {
          await sleep((region.end - region.start) * 1000);
          backingRef.current?.stop?.();
          backingRef.current = null;
          const take = await capture.stop();
          setPhase("SAVING TAKE");
          await savePass(take, 0, region.start);
          setSavedPasses(1);
        } else {
          return;
        }
      }
      captureRef.current = null;
      setPhase("SAVED");
      await onReload?.();
      setRecording(false);
      onRecordingChange?.(false);
    } catch (cause) {
      captureRef.current?.cancel?.();
      captureRef.current = null;
      backingRef.current?.stop?.();
      backingRef.current = null;
      setError(cause?.message || "Overdub recording failed");
      setPhase("ERROR");
      setRecording(false);
      onRecordingChange?.(false);
    }
  }

  async function stopOpenEnded() {
    if (!recording || !captureRef.current) return;
    cancelledRef.current = true;
    try {
      backingRef.current?.stop?.();
      backingRef.current = null;
      setPhase("FINALIZING TAKE");
      const take = await captureRef.current.stop();
      captureRef.current = null;
      setPhase("SAVING TAKE");
      await savePass(take, 0, region.start);
      setSavedPasses(1);
      await onReload?.();
      setPhase("SAVED");
    } catch (cause) {
      setError(cause?.message || "Overdub could not be finalized");
      setPhase("ERROR");
    } finally {
      setRecording(false);
      onRecordingChange?.(false);
    }
  }

  return (
    <>
      <div className="rounded-2xl border border-red-400/15 bg-red-400/[0.025] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-red-200/70"><Mic2 className="h-3.5 w-3.5" /> Overdub recorder</div>
            <div className="mt-1 text-xs text-white/55">{selectedTrack ? `${selectedTrack.name} · ${region.mode}` : "Select and arm a track"}</div>
          </div>
          <div className={`rounded-lg border px-2 py-1 text-[9px] ${armed ? "border-red-300/20 text-red-100/70" : "border-white/8 text-white/25"}`}>{armed ? "ARMED" : "NOT ARMED"}</div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="col-span-2 block text-[9px] uppercase tracking-[0.14em] text-white/25">Input
            <select value={deviceId} onChange={(event) => setDeviceId(event.target.value)} disabled={recording} className="mt-1.5 w-full rounded-lg border border-white/8 bg-[#0a0a0a] px-2 py-2 text-xs text-white/60">
              {!devices.length ? <option value="">Default audio input</option> : devices.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Audio input ${index + 1}`}</option>)}
            </select>
          </label>
          <label className="block text-[9px] uppercase tracking-[0.14em] text-white/25">Count-in bars
            <input type="number" min="0" max="8" value={countInBars} onChange={(event) => setCountInBars(Math.max(0, Math.min(8, Math.round(finite(event.target.value, 1)))))} disabled={recording} className="mt-1.5 w-full rounded-lg border border-white/8 bg-black/30 px-2 py-2 text-xs text-white/60" />
          </label>
          {loopEnabled ? <label className="block text-[9px] uppercase tracking-[0.14em] text-white/25">Loop passes
            <input type="number" min="1" max="20" value={loopPasses} onChange={(event) => setLoopPasses(Math.max(1, Math.min(20, Math.round(finite(event.target.value, 3)))))} disabled={recording} className="mt-1.5 w-full rounded-lg border border-white/8 bg-black/30 px-2 py-2 text-xs text-white/60" />
          </label> : <label className="flex items-center gap-2 self-end rounded-lg border border-white/8 px-2 py-2 text-[10px] text-white/45"><input type="checkbox" checked={punchEnabled} onChange={(event) => setPunchEnabled(event.target.checked)} disabled={recording} className="accent-red-300" /> Punch in/out</label>}
          <label className="col-span-2 block text-[9px] uppercase tracking-[0.14em] text-white/25">Recording offset (ms)
            <input type="number" min="-500" max="500" step="1" value={latencyCompMs} onChange={(event) => setLatencyCompMs(Math.max(-500, Math.min(500, finite(event.target.value, 0))))} disabled={recording} className="mt-1.5 w-full rounded-lg border border-white/8 bg-black/30 px-2 py-2 text-xs text-white/60" />
            <span className="mt-1 block normal-case tracking-normal text-[8px] text-white/18">Measured/manual compensation; 0 ms means no assumed microphone latency correction.</span>
          </label>
        </div>

        {!loopEnabled && punchEnabled ? <div className="mt-3 grid grid-cols-2 gap-3"><input type="number" step="0.1" value={punchStart} onChange={(event) => setPunchStart(Math.max(0, finite(event.target.value, 0)))} disabled={recording} className="rounded-lg border border-white/8 bg-black/30 px-2 py-2 text-xs text-white/60" /><input type="number" step="0.1" value={punchEnd} onChange={(event) => setPunchEnd(Math.max(punchStart + 0.1, finite(event.target.value, punchStart + 1)))} disabled={recording} className="rounded-lg border border-white/8 bg-black/30 px-2 py-2 text-xs text-white/60" /></div> : null}

        <div className="mt-4 rounded-xl border border-white/7 bg-black/25 p-3">
          <div className="flex items-center justify-between text-[9px] text-white/30"><span>PEAK {formatDb(meter.peak_dbfs)}</span><span>RMS {formatDb(meter.rms_dbfs)}</span></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full bg-current text-red-200/65 transition-all" style={{ width: `${Math.max(0, Math.min(100, ((finite(meter.peak_dbfs, -60) + 60) / 60) * 100))}%` }} /></div>
          <div className="mt-2 flex items-center justify-between text-[9px]"><span className={meter.clipping ? "text-red-200" : "text-emerald-100/50"}>{meter.clipping ? "CLIPPING — lower input gain" : phase}</span><span className="text-white/22">{savedPasses ? `${savedPasses} take${savedPasses === 1 ? "" : "s"} saved` : "24-bit raw PCM"}</span></div>
        </div>

        {error ? <div className="mt-3 text-[10px] text-red-100/70">{error}</div> : null}

        <div className="mt-4 flex gap-2">
          {!recording ? <button type="button" disabled={!armed || !selectedTrack} onClick={begin} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-300/25 bg-red-400/[0.09] px-3 py-2.5 text-xs font-medium text-red-100 disabled:opacity-25"><Radio className="h-4 w-4" /> Record / Overdub</button> : <button type="button" onClick={stopOpenEnded} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-300/30 bg-red-400/[0.12] px-3 py-2.5 text-xs font-medium text-red-100"><CircleStop className="h-4 w-4" /> Stop & save</button>}
        </div>

        <div className="mt-3 flex items-start gap-2 text-[9px] leading-4 text-white/25"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-100/40" />Project revision is persisted before capture. Each pass is a new immutable WAV/take; browser AGC, echo cancellation and noise suppression stay disabled.</div>
        <div className="mt-2 flex items-center gap-2 text-[9px] text-white/20"><Headphones className="h-3.5 w-3.5" />Backing project playback follows the recording range; original recordings are never overwritten.</div>
      </div>

      <MusicTakeLaneCompPanel
        track={selectedTrack}
        assetUrls={assetUrls}
        disabled={recording}
        onChange={persistCompTrack}
      />
    </>
  );
}
