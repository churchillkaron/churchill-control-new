"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  BadgeCheck,
  CircleStop,
  Download,
  FileAudio,
  Gauge,
  MicOff,
  Music4,
  Scissors,
  Upload,
} from "lucide-react";

const MAX_SOURCE_BYTES = 629145600;
const MAX_SOURCE_SECONDS = 900;
const ACCEPT = ".wav,.mp3,.m4a,.aac,.flac,.ogg,audio/*";
const RIGHTS_STATEMENT = "I confirm I have the rights or permission required for my intended use of this source audio.";

function text(value) {
  return String(value ?? "").trim();
}

function formatDuration(value) {
  const seconds = Math.max(0, Number(value || 0));
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "0 MB";
  return `${(bytes / 1024 / 1024).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

function stemLabel(key) {
  return ({
    backing_track_wav: "Backing WAV",
    backing_track_mp3: "Backing MP3",
    vocals: "Vocals",
    drums: "Drums",
    bass: "Bass",
    other: "Other instruments",
  })[key] || key;
}

async function audioDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    const cleanup = () => {
      URL.revokeObjectURL(url);
      audio.removeAttribute("src");
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = Number(audio.duration);
      cleanup();
      if (!Number.isFinite(duration) || duration <= 0) reject(new Error("Could not read audio duration"));
      else resolve(duration);
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error("Could not read this audio file"));
    };
    audio.src = url;
  });
}

export default function MusicBackingTrackPanel({
  organizationId,
  projectId = null,
  missionId = null,
  onComplete = null,
}) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [duration, setDuration] = useState(null);
  const [storageReference, setStorageReference] = useState("");
  const [sourcePlaybackUrl, setSourcePlaybackUrl] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [form, setForm] = useState({
    title: "Backing track",
    preserve_arrangement: true,
    key_shift_semitones: 0,
    tempo_ratio: 1,
    count_in_bars: 0,
    bpm: 120,
    export_stems: true,
    mastering_profile: "streaming",
  });
  const [plan, setPlan] = useState(null);
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const readyForPlan = Boolean(storageReference && duration && rightsConfirmed);
  const productionReady = plan?.ready_for_execution === true;
  const outputAssets = Array.isArray(session?.assets) ? session.assets : [];

  const sourceSummary = useMemo(() => {
    if (!file) return "Upload an original song or mix";
    return `${file.name} · ${formatBytes(file.size)}${duration ? ` · ${formatDuration(duration)}` : ""}`;
  }, [file, duration]);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setPlan(null);
  }

  async function request(payload) {
    const response = await fetch("/api/creative/music/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || result.success === false) {
      const cause = new Error(result.error || "Backing Track Studio request failed");
      cause.code = result.code || null;
      throw cause;
    }
    return result;
  }

  async function chooseFile(selected) {
    setError("");
    setPlan(null);
    setSession(null);
    setStorageReference("");
    setSourcePlaybackUrl("");
    if (!selected) {
      setFile(null);
      setDuration(null);
      return;
    }
    if (selected.size <= 0 || selected.size > MAX_SOURCE_BYTES) {
      setError("Source audio must be smaller than 600 MB.");
      return;
    }
    try {
      const measured = await audioDuration(selected);
      if (measured > MAX_SOURCE_SECONDS) {
        setError("Source audio can be up to 15 minutes.");
        return;
      }
      setFile(selected);
      setDuration(measured);
      setForm((current) => ({
        ...current,
        title: text(selected.name.replace(/\.[^.]+$/, "")) || current.title,
      }));
    } catch (cause) {
      setError(cause?.message || "Could not inspect source audio");
    }
  }

  async function uploadSource() {
    if (!organizationId || !file || !duration) return;
    setUploading(true);
    setError("");
    try {
      const target = await request({
        action: "prepare_source_upload",
        organization_id: organizationId,
        file_name: file.name,
        size_bytes: file.size,
        content_type: file.type || "audio/mpeg",
      });
      const upload = await fetch(target.upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!upload.ok) throw new Error(`Source upload failed (${upload.status})`);
      setStorageReference(target.storage_reference);
      setSourcePlaybackUrl(URL.createObjectURL(file));
    } catch (cause) {
      setError(cause?.message || "Source upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function reviewPlan() {
    if (!readyForPlan) return;
    setBusy(true);
    setError("");
    try {
      const result = await request({
        action: "backing_track_plan",
        organization_id: organizationId,
        creative_project_id: projectId,
        creative_mission_id: missionId,
        source_audio: storageReference,
        source_duration_seconds: duration,
        source_rights_confirmed: rightsConfirmed,
        ...form,
      });
      setPlan(result);
    } catch (cause) {
      setError(cause?.message || "Could not prepare backing track");
    } finally {
      setBusy(false);
    }
  }

  async function createBackingTrack() {
    if (!productionReady || !readyForPlan) return;
    setBusy(true);
    setError("");
    try {
      const result = await request({
        action: "backing_track",
        organization_id: organizationId,
        creative_project_id: projectId,
        creative_mission_id: missionId,
        source_audio: storageReference,
        source_duration_seconds: duration,
        source_rights_confirmed: rightsConfirmed,
        ...form,
      });
      setSession(result);
      if (!result.pending) onComplete?.(result);
    } catch (cause) {
      setError(cause?.message || "Backing track execution failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!session?.pending || !session?.usage_id || !organizationId) return undefined;
    let cancelled = false;
    let inFlight = false;
    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await request({
          action: "status",
          organization_id: organizationId,
          usage_id: session.usage_id,
        });
        if (!cancelled) {
          setSession((current) => ({ ...current, ...result }));
          if (!result.pending) onComplete?.(result);
        }
      } catch (cause) {
        if (!cancelled) setError(cause?.message || "Backing track status failed");
      } finally {
        inFlight = false;
      }
    };
    const timer = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.pending, session?.usage_id, organizationId]);

  useEffect(() => () => {
    if (sourcePlaybackUrl?.startsWith("blob:")) URL.revokeObjectURL(sourcePlaybackUrl);
  }, [sourcePlaybackUrl]);

  return (
    <section className="rounded-2xl border border-[#d6a66a]/18 bg-[#d6a66a]/[0.025] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#d6a66a]">
            <MicOff className="h-3.5 w-3.5" />
            Backing Track Studio
          </div>
          <div className="mt-2 text-lg font-medium text-white/82">Original song → performance backing track</div>
          <p className="mt-1 max-w-xl text-xs leading-5 text-white/34">
            Preserve the original arrangement, separate vocals/drums/bass/other, remove vocals and export a professional backing track plus stems.
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1.5 text-[9px] uppercase tracking-[0.14em] ${productionReady ? "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100/70" : "border-amber-300/20 bg-amber-300/[0.06] text-amber-100/65"}`}>
          {productionReady ? "Production ready" : "Separator certification pending"}
        </span>
      </div>

      <div className="mt-5 rounded-xl border border-dashed border-white/12 bg-black/25 p-4">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(event) => chooseFile(event.target.files?.[0] || null)}
        />
        <button type="button" onClick={() => inputRef.current?.click()} className="flex w-full items-center gap-3 text-left">
          <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3"><Upload className="h-5 w-5 text-[#d6a66a]/80" /></div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-white/68">{sourceSummary}</div>
            <div className="mt-1 text-[10px] text-white/26">WAV, MP3, M4A, AAC, FLAC or OGG · max 15 min · max 600 MB</div>
          </div>
        </button>
        {sourcePlaybackUrl ? <audio src={sourcePlaybackUrl} controls className="mt-4 w-full" /> : null}
        {file && !storageReference ? (
          <button type="button" disabled={uploading} onClick={uploadSource} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#d6a66a]/25 bg-[#d6a66a]/10 px-4 py-2 text-xs text-[#efd29f] disabled:opacity-45">
            {uploading ? <AudioLines className="h-3.5 w-3.5 animate-pulse" /> : <FileAudio className="h-3.5 w-3.5" />}
            {uploading ? "Uploading privately…" : "Upload source"}
          </button>
        ) : null}
        {storageReference ? <div className="mt-3 flex items-center gap-2 text-[10px] text-emerald-200/65"><BadgeCheck className="h-3.5 w-3.5" /> Private source ready</div> : null}
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/8 bg-white/[0.018] p-4">
        <input type="checkbox" checked={rightsConfirmed} onChange={(event) => { setRightsConfirmed(event.target.checked); setPlan(null); }} className="mt-0.5 h-4 w-4 accent-[#d6a66a]" />
        <span>
          <span className="block text-xs font-medium text-white/68">Rights confirmation</span>
          <span className="mt-1 block text-xs leading-5 text-white/35">{RIGHTS_STATEMENT}</span>
        </span>
      </label>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="text-[9px] uppercase tracking-[0.16em] text-white/28">Title</span><input value={form.title} onChange={(event) => update("title", event.target.value)} className="mt-1.5 w-full rounded-lg border border-white/8 bg-black/30 px-3 py-2.5 text-xs text-white/70 outline-none" /></label>
        <label className="block"><span className="text-[9px] uppercase tracking-[0.16em] text-white/28">Key shift</span><select value={form.key_shift_semitones} onChange={(event) => update("key_shift_semitones", Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-white/8 bg-[#090909] px-3 py-2.5 text-xs text-white/70 outline-none">{Array.from({ length: 25 }, (_, index) => index - 12).map((value) => <option key={value} value={value}>{value === 0 ? "Original key" : `${value > 0 ? "+" : ""}${value} semitone${Math.abs(value) === 1 ? "" : "s"}`}</option>)}</select></label>
        <label className="block"><span className="text-[9px] uppercase tracking-[0.16em] text-white/28">Tempo</span><div className="mt-1.5 flex items-center gap-3 rounded-lg border border-white/8 bg-black/30 px-3 py-2"><Gauge className="h-3.5 w-3.5 text-white/30" /><input type="range" min="0.5" max="1.5" step="0.01" value={form.tempo_ratio} onChange={(event) => update("tempo_ratio", Number(event.target.value))} className="min-w-0 flex-1" /><span className="w-10 text-right text-[10px] text-white/55">{Math.round(form.tempo_ratio * 100)}%</span></div></label>
        <label className="block"><span className="text-[9px] uppercase tracking-[0.16em] text-white/28">Count-in</span><select value={form.count_in_bars} onChange={(event) => update("count_in_bars", Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-white/8 bg-[#090909] px-3 py-2.5 text-xs text-white/70 outline-none"><option value="0">No count-in</option>{[1, 2, 4, 8].map((bars) => <option key={bars} value={bars}>{bars} bar{bars === 1 ? "" : "s"}</option>)}</select></label>
        {form.count_in_bars > 0 ? <label className="block"><span className="text-[9px] uppercase tracking-[0.16em] text-white/28">Count-in BPM</span><input type="number" min="30" max="300" value={form.bpm} onChange={(event) => update("bpm", Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-white/8 bg-black/30 px-3 py-2.5 text-xs text-white/70 outline-none" /></label> : null}
        <label className="flex items-center gap-2 self-end rounded-lg border border-white/8 bg-black/20 px-3 py-2.5 text-xs text-white/55"><input type="checkbox" checked={form.export_stems} onChange={(event) => update("export_stems", event.target.checked)} className="accent-[#d6a66a]" /> Export all stems</label>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-white/7 bg-black/20 p-3"><Scissors className="h-3.5 w-3.5 text-[#d6a66a]/70" /><div className="mt-2 text-[10px] text-white/55">4-stem separation</div><div className="mt-1 text-[9px] text-white/24">Vocals · drums · bass · other</div></div>
        <div className="rounded-lg border border-white/7 bg-black/20 p-3"><MicOff className="h-3.5 w-3.5 text-[#d6a66a]/70" /><div className="mt-2 text-[10px] text-white/55">Vocal removal</div><div className="mt-1 text-[9px] text-white/24">Backing = drums + bass + other</div></div>
        <div className="rounded-lg border border-white/7 bg-black/20 p-3"><Music4 className="h-3.5 w-3.5 text-[#d6a66a]/70" /><div className="mt-2 text-[10px] text-white/55">Performance controls</div><div className="mt-1 text-[9px] text-white/24">Key · tempo · count-in</div></div>
      </div>

      {error ? <div className="mt-4 rounded-lg border border-red-400/20 bg-red-400/[0.06] px-3 py-2.5 text-xs text-red-100/75">{error}</div> : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" disabled={!readyForPlan || busy} onClick={reviewPlan} className="rounded-lg border border-white/10 bg-white/[0.035] px-4 py-2.5 text-xs text-white/65 disabled:cursor-not-allowed disabled:opacity-35">
          {busy && !session?.pending ? "Checking…" : "Review backing track"}
        </button>
        <button type="button" disabled={!productionReady || busy || session?.pending} onClick={createBackingTrack} className="inline-flex items-center gap-2 rounded-lg bg-[#d6a66a] px-4 py-2.5 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-35">
          {session?.pending ? <AudioLines className="h-3.5 w-3.5 animate-pulse" /> : <MicOff className="h-3.5 w-3.5" />}
          {session?.pending ? "Separating…" : "Create backing track"}
        </button>
      </div>

      {plan ? <div className="mt-4 rounded-lg border border-white/8 bg-black/25 p-3 text-[10px] leading-5 text-white/34">
        {productionReady
          ? "Plan verified. Backing-track separation is certified and ready to run."
          : "Plan verified. The Studio workflow is ready, but paid execution remains disabled until the owned separator image, GPU benchmark, economics and human listening review are certified."}
      </div> : null}

      {session ? <div className="mt-5 rounded-xl border border-white/8 bg-black/25 p-4">
        <div className="flex items-center gap-2 text-xs text-white/60">
          {session.pending ? <AudioLines className="h-4 w-4 animate-pulse text-[#d6a66a]" /> : session.failed ? <CircleStop className="h-4 w-4 text-red-300/70" /> : <BadgeCheck className="h-4 w-4 text-emerald-300/70" />}
          {session.pending ? "Separating source and building backing track" : session.failed ? "Backing track failed" : "Backing track complete"}
        </div>
        {outputAssets.length ? <div className="mt-3 space-y-2">{outputAssets.map((asset) => {
          const key = text(asset.metadata?.music_separator_output_key);
          return <div key={asset.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/7 p-3"><div className="min-w-0"><div className="truncate text-xs text-white/58">{asset.title || stemLabel(key)}</div><div className="mt-1 text-[9px] uppercase tracking-[0.12em] text-white/22">{stemLabel(key)}</div></div><Download className="h-3.5 w-3.5 text-white/25" /></div>;
        })}</div> : null}
      </div> : null}
    </section>
  );
}
