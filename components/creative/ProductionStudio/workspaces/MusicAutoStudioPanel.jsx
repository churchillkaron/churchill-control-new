"use client";

import { useRef, useState } from "react";
import {
  AudioLines,
  CheckCircle2,
  FileAudio,
  ShieldCheck,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";

const MAX_SOURCE_BYTES = 1_073_741_824;
const ACCEPT = ".wav,.mp3,.m4a,.aac,.flac,.ogg,.opus,.mp4,.mov,.m4v,.webm,.mkv,audio/*,video/*";

function mediaLabel(file) {
  if (!file) return "Audio or performance video";
  return file.type?.startsWith("video/") ? "Performance video" : "Audio recording";
}

export default function MusicAutoStudioPanel({ organizationId, projectId = null, missionId = null }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [storageReference, setStorageReference] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function request(payload) {
    const response = await fetch("/api/creative/music/auto-studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || result.success === false) {
      throw new Error(result.error || "Auto Studio request failed");
    }
    return result;
  }

  function chooseFile(selected) {
    setError("");
    setPlan(null);
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
        content_type: file.type || "application/octet-stream",
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

  async function makeProfessional() {
    if (!storageReference || !rightsConfirmed || !file) return;
    setBusy(true);
    setError("");
    try {
      const result = await request({
        action: "plan",
        organization_id: organizationId,
        creative_project_id: projectId,
        creative_mission_id: missionId,
        source_media: storageReference,
        file_name: file.name,
        mime_type: file.type || null,
        source_rights_confirmed: true,
      });
      setPlan(result.plan);
    } catch (cause) {
      setError(cause?.message || "Auto Studio could not prepare the session");
    } finally {
      setBusy(false);
    }
  }

  const stages = Array.isArray(plan?.stages) ? plan.stages : [];

  return (
    <section className="mx-auto max-w-6xl p-6">
      <div className="overflow-hidden rounded-3xl border border-[#d6a66a]/20 bg-gradient-to-b from-[#d6a66a]/[0.07] to-black/20">
        <div className="border-b border-white/7 p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#d6a66a]">
                <Sparkles className="h-4 w-4" /> Full Auto Studio
              </div>
              <h2 className="mt-3 text-2xl font-medium tracking-tight text-white/90">Make it professional</h2>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-white/38">
                Upload a song, vocal recording or performance video. Avantiqo chooses the studio chain automatically: analyze, repair, vocal engineering when required, mix, master, quality control and delivery.
              </p>
            </div>
            <div className="rounded-full border border-emerald-300/15 bg-emerald-300/[0.05] px-3 py-1.5 text-[9px] uppercase tracking-[0.16em] text-emerald-100/65">
              Auto by default
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <div className="rounded-2xl border border-dashed border-white/12 bg-black/30 p-5">
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(event) => chooseFile(event.target.files?.[0] || null)}
              />
              <button type="button" onClick={() => inputRef.current?.click()} className="flex w-full items-center gap-4 text-left">
                <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
                  {file?.type?.startsWith("video/") ? <Video className="h-6 w-6 text-[#d6a66a]" /> : <Upload className="h-6 w-6 text-[#d6a66a]" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white/76">{file?.name || "Upload recording"}</div>
                  <div className="mt-1 text-[10px] text-white/30">{mediaLabel(file)} · private · max 1 GB</div>
                </div>
              </button>

              {file && !storageReference ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={uploadSource}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl border border-[#d6a66a]/25 bg-[#d6a66a]/10 px-4 py-2.5 text-xs text-[#efd29f] disabled:opacity-40"
                >
                  {busy ? <AudioLines className="h-4 w-4 animate-pulse" /> : <FileAudio className="h-4 w-4" />}
                  Upload securely
                </button>
              ) : null}

              {storageReference ? (
                <div className="mt-5 flex items-center gap-2 text-xs text-emerald-100/60">
                  <CheckCircle2 className="h-4 w-4" /> Source ready
                </div>
              ) : null}
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.018] p-4">
              <input
                type="checkbox"
                checked={rightsConfirmed}
                onChange={(event) => { setRightsConfirmed(event.target.checked); setPlan(null); }}
                className="mt-0.5 h-4 w-4 accent-[#d6a66a]"
              />
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#d6a66a]/70" />
              <span>
                <span className="block text-xs font-medium text-white/68">Rights confirmed</span>
                <span className="mt-1 block text-xs leading-5 text-white/34">I have the rights or permission required for this source recording.</span>
              </span>
            </label>

            <button
              type="button"
              disabled={!storageReference || !rightsConfirmed || busy}
              onClick={makeProfessional}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-[#d6a66a]/30 bg-[#d6a66a]/14 px-5 py-3.5 text-sm font-medium text-[#f2d8aa] shadow-[0_0_40px_rgba(214,166,106,0.06)] disabled:opacity-30"
            >
              <Sparkles className="h-4 w-4" /> MAKE IT PROFESSIONAL
            </button>

            {error ? <div className="mt-4 rounded-xl border border-red-400/15 bg-red-400/[0.05] px-4 py-3 text-xs text-red-200/70">{error}</div> : null}
          </div>

          <div className="rounded-2xl border border-white/8 bg-black/25 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[9px] uppercase tracking-[0.18em] text-white/28">Automatic studio chain</div>
                <div className="mt-1 text-sm text-white/68">{plan ? plan.title : "Avantiqo decides what the recording needs"}</div>
              </div>
              {plan ? <span className="text-[9px] uppercase tracking-[0.15em] text-[#d6a66a]/65">{plan.goal?.replaceAll("_", " ")}</span> : null}
            </div>

            <div className="mt-5 space-y-2">
              {(stages.length ? stages : [
                { id: "analyze", label: "Analyze", description: "Recording quality, stream, loudness and risk", status: "READY" },
                { id: "repair", label: "Repair", description: "Noise, hum, clipping and dynamics preparation", status: "READY" },
                { id: "vocal", label: "Vocal engineering", description: "Mic polish, de-ess, pitch/timing when needed", status: "AUTO" },
                { id: "mix", label: "Mix", description: "Balance, hierarchy, space and stereo image", status: "READY" },
                { id: "master", label: "Master", description: "Release loudness, true peak and final polish", status: "READY" },
                { id: "delivery", label: "Delivery", description: "24-bit WAV, MP3 and supporting outputs", status: "READY" },
              ]).map((item, index) => (
                <div key={item.id} className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.018] p-3.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#d6a66a]/15 bg-[#d6a66a]/[0.05] text-[10px] text-[#d6a66a]/70">{index + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-medium text-white/68">{item.label}</div>
                      <div className={`text-[8px] uppercase tracking-[0.13em] ${item.status === "READY" ? "text-emerald-100/45" : "text-amber-100/45"}`}>{item.status}</div>
                    </div>
                    <div className="mt-1 text-[10px] leading-4 text-white/29">{item.description}</div>
                  </div>
                </div>
              ))}
            </div>

            {plan ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/7 bg-white/[0.015] p-3.5">
                  <div className="text-[8px] uppercase tracking-[0.15em] text-white/25">Master target</div>
                  <div className="mt-1 text-xs text-white/58">{plan.mastering?.target_lufs} LUFS · {plan.mastering?.true_peak_dbtp} dBTP</div>
                </div>
                <div className="rounded-xl border border-white/7 bg-white/[0.015] p-3.5">
                  <div className="text-[8px] uppercase tracking-[0.15em] text-white/25">Delivery</div>
                  <div className="mt-1 text-xs text-white/58">24-bit WAV · MP3 320k</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
