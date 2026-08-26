"use client";

import { useRef, useState } from "react";
import { AudioLines, CheckCircle2, FileAudio, ShieldCheck, Upload } from "lucide-react";

const MAX_SOURCE_BYTES = 1_073_741_824;
const ACCEPT = ".wav,.mp3,.m4a,.aac,.flac,.ogg,.opus,audio/*";

const PROFILES = Object.freeze({
  vocal: Object.freeze({
    eyebrow: "Vocal Studio",
    title: "Polish the vocal",
    description: "Clean, shape and prepare a vocal recording through the governed Music Auto Studio chain. Local restoration runs now; certified pitch/timing correction remains separately gated when required.",
    source_role: "vocal",
    goal: "vocal_polish",
    action: "POLISH VOCAL",
  }),
  mix: Object.freeze({
    eyebrow: "Mix Studio",
    title: "Build the final mix",
    description: "Process uploaded stems or a prepared multitrack source through Avantiqo's mix-and-master chain with release-oriented gain structure and loudness control.",
    source_role: "stems",
    goal: "mix_and_master",
    action: "MIX & MASTER",
  }),
  master: Object.freeze({
    eyebrow: "Master Studio",
    title: "Create the release master",
    description: "Analyze and master a finished stereo source to Avantiqo release targets, with 24-bit WAV and MP3 delivery evidence.",
    source_role: "song",
    goal: "release_master",
    action: "MASTER TRACK",
  }),
});

function profileFor(mode) {
  return PROFILES[mode] || PROFILES.master;
}

export default function MusicSpecialistStudioPanel({
  mode = "master",
  organizationId,
  projectId = null,
  missionId = null,
}) {
  const profile = profileFor(mode);
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [storageReference, setStorageReference] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function request(payload) {
    const response = await fetch("/api/creative/music/auto-studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok || body.success === false) throw new Error(body.error || `${profile.eyebrow} request failed`);
    return body;
  }

  function chooseFile(selected) {
    setError("");
    setResult(null);
    setStorageReference("");
    if (!selected) {
      setFile(null);
      return;
    }
    if (selected.size <= 0 || selected.size > MAX_SOURCE_BYTES) {
      setError("Source must be smaller than 1 GB.");
      return;
    }
    setFile(selected);
  }

  async function uploadSource() {
    if (!organizationId || !file) return;
    setBusy(true);
    setError("");
    try {
      const target = await request({
        action: "prepare_source_upload",
        organization_id: organizationId,
        file_name: file.name,
        size_bytes: file.size,
        content_type: file.type || "audio/wav",
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
      setBusy(false);
    }
  }

  async function execute() {
    if (!storageReference || !rightsConfirmed || !file) return;
    if (!projectId) {
      setError(`Open or create a Music project before running ${profile.eyebrow}.`);
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const body = await request({
        action: "execute_local",
        organization_id: organizationId,
        creative_project_id: projectId,
        creative_mission_id: missionId,
        source_media: storageReference,
        file_name: file.name,
        mime_type: file.type || "audio/wav",
        source_rights_confirmed: true,
        source_role: profile.source_role,
        goal: profile.goal,
      });
      setResult(body);
    } catch (cause) {
      setError(cause?.message || `${profile.eyebrow} could not complete the source`);
    } finally {
      setBusy(false);
    }
  }

  const plan = result?.plan || null;
  const output = result?.output || null;
  const stages = Array.isArray(plan?.stages) ? plan.stages : [];
  const blockers = Array.isArray(result?.elite_studio_blockers) ? result.elite_studio_blockers : [];

  return (
    <section className="mx-auto max-w-6xl p-6">
      <div className="overflow-hidden rounded-3xl border border-[#d6a66a]/20 bg-gradient-to-b from-[#d6a66a]/[0.07] to-black/20">
        <div className="border-b border-white/7 p-6 sm:p-8">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#d6a66a]">{profile.eyebrow}</div>
          <h2 className="mt-3 text-2xl font-medium tracking-tight text-white/90">{profile.title}</h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-white/38">{profile.description}</p>
        </div>

        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <div className="rounded-2xl border border-dashed border-white/12 bg-black/30 p-5">
              <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(event) => chooseFile(event.target.files?.[0] || null)} />
              <button type="button" onClick={() => inputRef.current?.click()} className="flex w-full items-center gap-4 text-left">
                <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-4"><Upload className="h-6 w-6 text-[#d6a66a]" /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white/76">{file?.name || "Upload audio source"}</div>
                  <div className="mt-1 text-[10px] text-white/30">Private audio · max 1 GB</div>
                </div>
              </button>

              {file && !storageReference ? (
                <button type="button" disabled={busy} onClick={uploadSource} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-[#d6a66a]/25 bg-[#d6a66a]/10 px-4 py-2.5 text-xs text-[#efd29f] disabled:opacity-40">
                  {busy ? <AudioLines className="h-4 w-4 animate-pulse" /> : <FileAudio className="h-4 w-4" />}
                  Upload securely
                </button>
              ) : null}
              {storageReference ? <div className="mt-5 flex items-center gap-2 text-xs text-emerald-100/60"><CheckCircle2 className="h-4 w-4" /> Source ready</div> : null}
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.018] p-4">
              <input type="checkbox" checked={rightsConfirmed} onChange={(event) => { setRightsConfirmed(event.target.checked); setResult(null); }} className="mt-0.5 h-4 w-4 accent-[#d6a66a]" />
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#d6a66a]/70" />
              <span>
                <span className="block text-xs font-medium text-white/68">Rights confirmed</span>
                <span className="mt-1 block text-xs leading-5 text-white/34">I have the rights or permission required for this source recording.</span>
              </span>
            </label>

            <button type="button" disabled={!storageReference || !rightsConfirmed || busy} onClick={execute} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-[#d6a66a]/30 bg-[#d6a66a]/14 px-5 py-3.5 text-sm font-medium text-[#f2d8aa] disabled:opacity-30">
              {busy ? <AudioLines className="h-4 w-4 animate-pulse" /> : null}
              {busy ? "PROCESSING..." : profile.action}
            </button>

            {output?.master_url ? (
              <div className="mt-5 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.04] p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-emerald-100/70"><CheckCircle2 className="h-4 w-4" /> Studio output complete</div>
                <audio className="mt-3 w-full" controls src={output.master_url} />
              </div>
            ) : null}
            {blockers.length ? <div className="mt-3 text-[10px] leading-4 text-amber-100/55">Additional certified stages still required: {blockers.map((item) => item.stage?.replaceAll("_", " ")).filter(Boolean).join(", ")}.</div> : null}
            {error ? <div className="mt-4 rounded-xl border border-red-400/15 bg-red-400/[0.05] px-4 py-3 text-xs text-red-200/70">{error}</div> : null}
          </div>

          <div className="rounded-2xl border border-white/8 bg-black/25 p-5">
            <div className="text-[9px] uppercase tracking-[0.18em] text-white/28">Studio chain</div>
            <div className="mt-1 text-sm text-white/68">{plan ? plan.title : `${profile.eyebrow} decides the required chain`}</div>
            <div className="mt-5 space-y-2">
              {(stages.length ? stages : [
                { id: "analyze", label: "Analyze", description: "Inspect source and determine required processing.", status: "READY" },
                { id: "process", label: profile.eyebrow, description: profile.description, status: "READY" },
                { id: "quality", label: "Quality control", description: "Validate loudness, peak and delivery evidence.", status: "READY" },
              ]).map((item, index) => (
                <div key={item.id} className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.018] p-3.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#d6a66a]/15 bg-[#d6a66a]/[0.05] text-[10px] text-[#d6a66a]/70">{index + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3"><div className="text-xs font-medium text-white/68">{item.label}</div><div className={`text-[8px] uppercase tracking-[0.13em] ${item.status === "READY" ? "text-emerald-100/45" : "text-amber-100/45"}`}>{item.status}</div></div>
                    <div className="mt-1 text-[10px] leading-4 text-white/29">{item.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
