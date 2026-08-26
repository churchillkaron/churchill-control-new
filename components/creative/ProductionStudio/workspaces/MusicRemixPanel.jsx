"use client";

import { useMemo, useRef, useState } from "react";
import { AudioLines, FileAudio, RefreshCw, Scissors, Upload, WandSparkles } from "lucide-react";

const MAX_SOURCE_BYTES = 629145600;
const ACCEPT = ".wav,.mp3,.m4a,.aac,.flac,.ogg,audio/*";
const CONFIG = Object.freeze({
  remix: {
    label: "Remix / Cover",
    title: "Rework a source track into a new musical direction",
    description: "Change style, mood, energy and cover strength while preserving useful musical identity.",
    review: "Review remix",
    create: "Create remix",
    icon: RefreshCw,
  },
  edit: {
    label: "Edit / Repaint",
    title: "Replace only the musical section that needs changing",
    description: "Choose a time range and a structured musical direction. The rest of the source remains outside the repaint range.",
    review: "Review edit",
    create: "Create edit",
    icon: Scissors,
  },
  extend: {
    label: "Extend",
    title: "Continue a source track beyond its current ending",
    description: "Outpaint a new continuation from the source tail while preserving musical continuity and direction.",
    review: "Review extension",
    create: "Extend track",
    icon: WandSparkles,
  },
});

export default function MusicRemixPanel({
  organizationId,
  projectId = null,
  missionId = null,
  operation = "remix",
}) {
  const mode = CONFIG[operation] ? operation : "remix";
  const config = CONFIG[mode];
  const Icon = config.icon;
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [storageReference, setStorageReference] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [style, setStyle] = useState("modern premium");
  const [mood, setMood] = useState("confident, polished");
  const [energy, setEnergy] = useState("balanced");
  const [coverStrength, setCoverStrength] = useState(0.6);
  const [editStart, setEditStart] = useState(0);
  const [editEnd, setEditEnd] = useState(15);
  const [extensionSeconds, setExtensionSeconds] = useState(30);
  const [continuityOverlapSeconds, setContinuityOverlapSeconds] = useState(4);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const executionReady = plan?.ready_for_execution === true && plan?.execution_route_enabled === true;
  const certification = plan?.plan?.certification || null;
  const modelLane = plan?.plan?.model_lane || null;
  const statusLabel = useMemo(() => {
    if (executionReady) return "Production ready";
    if (mode === "extend") return "Temporal outpaint benchmark pending";
    return "Benchmark pending";
  }, [executionReady, mode]);

  async function request(payload) {
    const response = await fetch("/api/creative/music/remix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || result.success === false) {
      throw new Error(result.error || "Music transformation request failed");
    }
    return result;
  }

  function resetPlan() {
    setPlan(null);
  }

  function chooseFile(selected) {
    setError("");
    resetPlan();
    setStorageReference("");
    if (!selected) {
      setFile(null);
      return;
    }
    if (selected.size <= 0 || selected.size > MAX_SOURCE_BYTES) {
      setError("Source audio must be smaller than 600 MB.");
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
        operation: mode,
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
      setBusy(false);
    }
  }

  async function reviewPlan() {
    if (!storageReference || !rightsConfirmed) return;
    setBusy(true);
    setError("");
    try {
      const result = await request({
        action: "plan",
        operation: mode,
        organization_id: organizationId,
        creative_project_id: projectId,
        creative_mission_id: missionId,
        source_audio: storageReference,
        source_rights_confirmed: true,
        style,
        mood,
        energy,
        instrumental: true,
        ...(mode === "remix" ? { audio_cover_strength: coverStrength } : {}),
        ...(mode === "edit" ? {
          repainting_start: Number(editStart),
          repainting_end: Number(editEnd),
        } : {}),
        ...(mode === "extend" ? {
          extension_seconds: Number(extensionSeconds),
          continuity_overlap_seconds: Number(continuityOverlapSeconds),
        } : {}),
      });
      setPlan(result);
    } catch (cause) {
      setError(cause?.message || `Could not prepare ${mode}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[#d6a66a]/18 bg-[#d6a66a]/[0.025] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#d6a66a]"><Icon className="h-3.5 w-3.5" /> {config.label}</div>
          <div className="mt-2 text-lg font-medium text-white/82">{config.title}</div>
          <p className="mt-1 max-w-xl text-xs leading-5 text-white/34">{config.description}</p>
        </div>
        <span className="rounded-full border border-amber-300/20 bg-amber-300/[0.06] px-3 py-1.5 text-[9px] uppercase tracking-[0.14em] text-amber-100/65">{statusLabel}</span>
      </div>

      <div className="mt-5 rounded-xl border border-dashed border-white/12 bg-black/25 p-4">
        <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(event) => chooseFile(event.target.files?.[0] || null)} />
        <button type="button" onClick={() => inputRef.current?.click()} className="flex w-full items-center gap-3 text-left">
          <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3"><Upload className="h-5 w-5 text-[#d6a66a]/80" /></div>
          <div className="min-w-0 flex-1"><div className="truncate text-sm text-white/68">{file?.name || "Upload source audio"}</div><div className="mt-1 text-[10px] text-white/26">Private source upload · max 600 MB</div></div>
        </button>
        {file && !storageReference ? <button type="button" disabled={busy} onClick={uploadSource} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#d6a66a]/25 bg-[#d6a66a]/10 px-4 py-2 text-xs text-[#efd29f] disabled:opacity-45">{busy ? <AudioLines className="h-3.5 w-3.5 animate-pulse" /> : <FileAudio className="h-3.5 w-3.5" />}Upload source</button> : null}
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/8 bg-white/[0.018] p-4"><input type="checkbox" checked={rightsConfirmed} onChange={(event) => { setRightsConfirmed(event.target.checked); resetPlan(); }} className="mt-0.5 h-4 w-4 accent-[#d6a66a]" /><span><span className="block text-xs font-medium text-white/68">Rights confirmation</span><span className="mt-1 block text-xs leading-5 text-white/35">I confirm I have the rights or permission required for my intended use of this source audio.</span></span></label>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="text-[9px] uppercase tracking-[0.16em] text-white/28">Style</span><input value={style} onChange={(event) => { setStyle(event.target.value); resetPlan(); }} className="mt-1.5 w-full rounded-lg border border-white/8 bg-black/30 px-3 py-2.5 text-xs text-white/70 outline-none" /></label>
        <label className="block"><span className="text-[9px] uppercase tracking-[0.16em] text-white/28">Mood</span><input value={mood} onChange={(event) => { setMood(event.target.value); resetPlan(); }} className="mt-1.5 w-full rounded-lg border border-white/8 bg-black/30 px-3 py-2.5 text-xs text-white/70 outline-none" /></label>
        <label className="block"><span className="text-[9px] uppercase tracking-[0.16em] text-white/28">Energy</span><select value={energy} onChange={(event) => { setEnergy(event.target.value); resetPlan(); }} className="mt-1.5 w-full rounded-lg border border-white/8 bg-[#090909] px-3 py-2.5 text-xs text-white/70 outline-none"><option value="low">Low</option><option value="balanced">Balanced</option><option value="high">High</option></select></label>
        {mode === "remix" ? <label className="block"><span className="text-[9px] uppercase tracking-[0.16em] text-white/28">Cover strength</span><div className="mt-1.5 flex items-center gap-3 rounded-lg border border-white/8 bg-black/30 px-3 py-2"><input type="range" min="0" max="1" step="0.05" value={coverStrength} onChange={(event) => { setCoverStrength(Number(event.target.value)); resetPlan(); }} className="min-w-0 flex-1" /><span className="w-9 text-right text-[10px] text-white/55">{Math.round(coverStrength * 100)}%</span></div></label> : null}
        {mode === "edit" ? <><label className="block"><span className="text-[9px] uppercase tracking-[0.16em] text-white/28">Edit start</span><input type="number" min="0" step="0.1" value={editStart} onChange={(event) => { setEditStart(event.target.value); resetPlan(); }} className="mt-1.5 w-full rounded-lg border border-white/8 bg-black/30 px-3 py-2.5 text-xs text-white/70 outline-none" /></label><label className="block"><span className="text-[9px] uppercase tracking-[0.16em] text-white/28">Edit end</span><input type="number" min="0.1" step="0.1" value={editEnd} onChange={(event) => { setEditEnd(event.target.value); resetPlan(); }} className="mt-1.5 w-full rounded-lg border border-white/8 bg-black/30 px-3 py-2.5 text-xs text-white/70 outline-none" /></label></> : null}
        {mode === "extend" ? <><label className="block"><span className="text-[9px] uppercase tracking-[0.16em] text-white/28">Extend by seconds</span><input type="number" min="5" max="120" step="1" value={extensionSeconds} onChange={(event) => { setExtensionSeconds(event.target.value); resetPlan(); }} className="mt-1.5 w-full rounded-lg border border-white/8 bg-black/30 px-3 py-2.5 text-xs text-white/70 outline-none" /></label><label className="block"><span className="text-[9px] uppercase tracking-[0.16em] text-white/28">Continuity overlap</span><input type="number" min="1" max="12" step="0.5" value={continuityOverlapSeconds} onChange={(event) => { setContinuityOverlapSeconds(event.target.value); resetPlan(); }} className="mt-1.5 w-full rounded-lg border border-white/8 bg-black/30 px-3 py-2.5 text-xs text-white/70 outline-none" /><span className="mt-1 block text-[9px] leading-4 text-white/24">Seconds from the existing ending used to blend into the new continuation.</span></label></> : null}
      </div>

      {plan ? <div className="mt-5 rounded-xl border border-white/8 bg-black/25 p-4"><div className="text-[9px] uppercase tracking-[0.18em] text-white/28">{config.label} plan</div><div className="mt-2 text-xs text-white/60">Avantiqo-owned Music engine{modelLane ? ` · ${modelLane}` : ""}</div><div className="mt-1 text-[10px] text-white/30">Status: {certification || "Pending certification"}</div>{mode === "extend" ? <div className="mt-2 text-[10px] text-amber-100/45">XL Turbo tail outpainting is implemented. Execution remains blocked until temporal extension is benchmark-certified and human-reviewed.</div> : null}</div> : null}
      {error ? <div className="mt-4 rounded-lg border border-red-400/15 bg-red-400/[0.05] px-3 py-2 text-xs text-red-200/70">{error}</div> : null}

      <div className="mt-5 flex gap-3"><button type="button" disabled={!storageReference || !rightsConfirmed || busy} onClick={reviewPlan} className="rounded-lg border border-[#d6a66a]/25 bg-[#d6a66a]/10 px-4 py-2.5 text-xs text-[#efd29f] disabled:opacity-35">{config.review}</button><button type="button" disabled={!executionReady} className="rounded-lg border border-white/10 bg-white/[0.035] px-4 py-2.5 text-xs text-white/55 disabled:opacity-30">{config.create}</button></div>
    </section>
  );
}
