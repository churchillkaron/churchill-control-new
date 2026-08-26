"use client";

import { useRef, useState } from "react";
import { AudioLines, BadgeCheck, FileAudio, Scissors, Upload } from "lucide-react";

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

export default function MusicStemsPanel({ organizationId, projectId = null, missionId = null }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [duration, setDuration] = useState(null);
  const [storageReference, setStorageReference] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function request(payload) {
    const response = await fetch("/api/creative/music/stems", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || result.success === false) throw new Error(result.error || "Music Stems request failed");
    return result;
  }

  async function chooseFile(selected) {
    setError("");
    setPlan(null);
    setStorageReference("");
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
    } catch (cause) {
      setError(cause?.message || "Source upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function reviewPlan() {
    if (!storageReference || !duration || !rightsConfirmed) return;
    setBusy(true);
    setError("");
    try {
      const result = await request({
        action: "plan",
        organization_id: organizationId,
        creative_project_id: projectId,
        creative_mission_id: missionId,
        title: text(file?.name?.replace(/\.[^.]+$/, "")) || "Separated stems",
        source_audio: storageReference,
        source_duration_seconds: duration,
        source_rights_confirmed: true,
      });
      setPlan(result);
    } catch (cause) {
      setError(cause?.message || "Could not prepare stem separation");
    } finally {
      setBusy(false);
    }
  }

  const ready = Boolean(storageReference && duration && rightsConfirmed);
  const executionReady = plan?.ready_for_execution === true;

  return (
    <section className="rounded-2xl border border-[#d6a66a]/18 bg-[#d6a66a]/[0.025] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#d6a66a]">
            <Scissors className="h-3.5 w-3.5" />
            Stem Separation
          </div>
          <div className="mt-2 text-lg font-medium text-white/82">Split a song into professional working stems</div>
          <p className="mt-1 max-w-xl text-xs leading-5 text-white/34">
            Separate vocals, drums, bass and other instruments from confirmed source audio for rehearsal, remixing, editing and production work.
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1.5 text-[9px] uppercase tracking-[0.14em] ${executionReady ? "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100/70" : "border-amber-300/20 bg-amber-300/[0.06] text-amber-100/65"}`}>
          {executionReady ? "Production ready" : "Certification pending"}
        </span>
      </div>

      <div className="mt-5 rounded-xl border border-dashed border-white/12 bg-black/25 p-4">
        <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(event) => chooseFile(event.target.files?.[0] || null)} />
        <button type="button" onClick={() => inputRef.current?.click()} className="flex w-full items-center gap-3 text-left">
          <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3"><Upload className="h-5 w-5 text-[#d6a66a]/80" /></div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-white/68">{file ? `${file.name} · ${formatBytes(file.size)}${duration ? ` · ${formatDuration(duration)}` : ""}` : "Upload a source song or mix"}</div>
            <div className="mt-1 text-[10px] text-white/26">WAV, MP3, M4A, AAC, FLAC or OGG · max 15 min · max 600 MB</div>
          </div>
        </button>
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

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {["Vocals", "Drums", "Bass", "Other"].map((stem) => (
          <div key={stem} className="rounded-xl border border-white/8 bg-black/25 px-4 py-4 text-center">
            <div className="text-[9px] uppercase tracking-[0.16em] text-white/28">Stem</div>
            <div className="mt-1 text-sm text-white/65">{stem}</div>
          </div>
        ))}
      </div>

      {plan ? (
        <div className="mt-5 rounded-xl border border-white/8 bg-black/25 p-4">
          <div className="text-[9px] uppercase tracking-[0.18em] text-white/28">Separation plan</div>
          <div className="mt-2 text-xs text-white/60">Demucs HTDemucs FT · four-stem separation · private outputs</div>
          <div className="mt-1 text-[10px] text-white/30">Status: {plan.plan?.certification || "Pending certification"}</div>
        </div>
      ) : null}

      {error ? <div className="mt-4 rounded-lg border border-red-400/15 bg-red-400/[0.05] px-3 py-2 text-xs text-red-200/70">{error}</div> : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" disabled={!ready || busy} onClick={reviewPlan} className="rounded-lg border border-[#d6a66a]/25 bg-[#d6a66a]/10 px-4 py-2.5 text-xs text-[#efd29f] disabled:cursor-not-allowed disabled:opacity-35">
          {busy ? "Reviewing…" : "Review separation"}
        </button>
        <button type="button" disabled={!executionReady} className="rounded-lg border border-white/10 bg-white/[0.035] px-4 py-2.5 text-xs text-white/55 disabled:cursor-not-allowed disabled:opacity-30">
          Separate stems
        </button>
      </div>
    </section>
  );
}
