"use client";

import { useRef, useState } from "react";
import { AudioLines, Download, FileAudio, ShieldCheck, Sparkles, Upload } from "lucide-react";

const MAX_SOURCE_BYTES = 629145600;
const ACCEPT = ".wav,.mp3,.m4a,.aac,.flac,.ogg,audio/*";

function text(value) { return String(value ?? "").trim(); }

export default function MusicAudioCleanupPanel({ organizationId, projectId = null, missionId = null, onOpenWorkstation = null }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [storageReference, setStorageReference] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [sourceRole, setSourceRole] = useState("song");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function request(payload) {
    const response = await fetch("/api/creative/music/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organization_id: organizationId, creative_project_id: projectId, creative_mission_id: missionId, ...payload }) });
    const data = await response.json();
    if (!response.ok || data.success === false) throw new Error(data.error || "Audio cleanup failed");
    return data;
  }

  async function chooseFile(event) {
    const next = event.target.files?.[0] || null;
    setError(""); setResult(null); setStorageReference(""); setFile(next);
    if (!next) return;
    if (next.size <= 0 || next.size > MAX_SOURCE_BYTES) { setError("Audio file is too large or empty."); return; }
    setUploading(true);
    try {
      const prep = await request({ action: "prepare_source_upload", file_name: next.name, size_bytes: next.size, content_type: next.type || "audio/wav" });
      const upload = await fetch(prep.upload_url, { method: "PUT", headers: { "Content-Type": next.type || "audio/wav" }, body: next });
      if (!upload.ok) throw new Error("Source upload failed");
      setStorageReference(prep.storage_reference);
    } catch (cause) { setError(cause.message || "Upload failed"); }
    finally { setUploading(false); }
  }

  async function runCleanup() {
    if (!storageReference || !rightsConfirmed || !projectId) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const data = await request({ action: "audio_cleanup", source_audio: storageReference, source_role: sourceRole, source_rights_confirmed: true, file_name: file?.name || "audio-source", mime_type: file?.type || null, title: file?.name?.replace(/\.[^.]+$/, "") || "Cleaned audio" });
      setResult(data);
    } catch (cause) { setError(cause.message || "Audio cleanup failed"); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto max-w-6xl p-6">
    <section className="overflow-hidden rounded-[22px] border border-black/[0.075] bg-white">
      <div className="border-b border-black/[0.06] px-6 py-5">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9A744B]"><Sparkles className="h-4 w-4" /> Clean & Repair Audio</div>
        <h2 className="mt-2 text-[24px] font-medium tracking-[-0.04em] text-[#1B1A18]">Restore recordings without overwriting the original</h2>
        <p className="mt-2 max-w-3xl text-[11px] leading-5 text-[#817B73]">Avantiqo analyzes the source and applies conservative owned local restoration such as noise reduction, hum filtering, tonal repair, de-essing and dynamics preparation. The result is a private 24-bit / 48 kHz WAV.</p>
      </div>
      <div className="grid gap-4 p-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border border-black/[0.06] bg-[#FCFBF8] p-5">
          <input ref={inputRef} type="file" accept={ACCEPT} onChange={chooseFile} className="hidden" />
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading || busy} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-black/[0.12] bg-white px-4 py-8 text-[11px] font-semibold text-[#5B554E] disabled:opacity-40"><Upload className="h-4 w-4" /> {uploading ? "Uploading…" : file ? file.name : "Upload recording"}</button>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#8A867F]">Source type<select value={sourceRole} onChange={(e) => setSourceRole(e.target.value)} disabled={busy} className="mt-1.5 w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2.5 text-[10px] normal-case tracking-normal text-[#514B44]"><option value="song">Song / mixed audio</option><option value="solo_vocal">Solo vocal</option><option value="instrument">Instrument</option><option value="dialogue">Dialogue</option></select></label>
            <div className="rounded-xl border border-black/[0.06] bg-white p-3 text-[9px] leading-4 text-[#817B73]"><div className="flex items-center gap-1.5 font-semibold text-[#514B44]"><ShieldCheck className="h-3.5 w-3.5" /> Original preserved</div><div className="mt-1">Cleanup creates a new restored asset. It never overwrites your uploaded recording.</div></div>
          </div>
          <label className="mt-4 flex items-start gap-2 text-[10px] leading-5 text-[#6F6A62]"><input type="checkbox" checked={rightsConfirmed} onChange={(e) => setRightsConfirmed(e.target.checked)} className="mt-1" /> I confirm I have the rights or permission required for my intended use of this audio.</label>
          {error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700">{error}</div> : null}
          <button type="button" onClick={runCleanup} disabled={!storageReference || !rightsConfirmed || !projectId || busy || uploading} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[#25231F] px-4 text-[10px] font-semibold text-white disabled:opacity-35"><AudioLines className="h-4 w-4" /> {busy ? "Cleaning audio…" : "Clean & repair"}</button>
        </div>
        <aside className="rounded-2xl border border-black/[0.06] bg-[#211F1C] p-5 text-white">
          <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/40">Restored result</div>
          {result?.asset?.playback_url ? <><div className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-white/80"><FileAudio className="h-4 w-4" /> Restored WAV</div><audio controls src={result.asset.playback_url} className="mt-4 w-full" /><a href={result.asset.playback_url} download className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-[9px] font-semibold text-white/65"><Download className="h-3.5 w-3.5" /> Download WAV</a>{onOpenWorkstation ? <button type="button" onClick={onOpenWorkstation} className="ml-2 rounded-lg border border-white/10 px-3 py-2 text-[9px] font-semibold text-white/65">Open Workstation</button> : null}</> : <div className="mt-3 text-[9px] leading-5 text-white/35">Upload a recording and run cleanup. The restored file will stay private and attached to this project.</div>}
        </aside>
      </div>
    </section>
  </div>;
}
