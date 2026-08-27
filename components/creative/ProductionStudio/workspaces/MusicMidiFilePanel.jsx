"use client";

import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { encodeStandardMidiFile, parseStandardMidiFile } from "@/lib/creative/music/runtime/CreativeMusicMidiFileRuntime";

function safeName(value) {
  return String(value || "avantiqo-music").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0,80) || "avantiqo-music";
}

export default function MusicMidiFilePanel({ organizationId, projectId, session, disabled = false, onReload }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function importFile(file) {
    if (!file || busy || disabled || !session) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const parsed = parseStandardMidiFile(new Uint8Array(await file.arrayBuffer()));
      const response = await fetch("/api/creative/music/midi-file", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ action:"import_parsed", organization_id:organizationId, creative_project_id:projectId, expected_revision:session.revision || 0, parsed, replace_existing:false, apply_tempo_map:true, apply_first_tempo:false, apply_first_time_signature:false }),
      });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error || "MIDI import failed");
      setMessage(`${body.imported_track_count || 0} MIDI track(s) imported with ${body.tempo_event_count || 0} tempo and ${body.meter_event_count || 0} meter event(s).`);
      await onReload?.();
    } catch (cause) { setError(cause?.message || "MIDI import failed"); }
    finally { setBusy(false); }
  }

  function exportFile() {
    if (!session?.midi) return;
    try {
      setError(""); setMessage("");
      const bytes = encodeStandardMidiFile({ midi:session.midi, bpm:session.bpm, time_signature:session.time_signature, tempo_map:session.tempo_map });
      const url = URL.createObjectURL(new Blob([bytes], { type:"audio/midi" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${safeName(session.title)}.mid`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(`Exported ${session.midi.tracks?.length || 0} MIDI track(s) with the project tempo/meter map.`);
    } catch (cause) { setError(cause?.message || "MIDI export failed"); }
  }

  return <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.018] p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#d6a66a]/65">Standard MIDI File</div><div className="mt-1 text-[8px] leading-4 text-white/24">Move performances between Avantiqo and external DAWs without rendering them to audio. Notes, controllers, tempo changes and meter changes travel with format-1 MIDI; Avantiqo linear tempo ramps are preserved exactly for Avantiqo re-import and exported as compatible stepped tempo events for other DAWs.</div></div>
      <div className="flex gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/8 px-2.5 py-1.5 text-[8px] text-white/38"><Upload className="h-3 w-3" /> {busy ? "Importing…" : "Import .mid"}<input type="file" accept=".mid,.midi,audio/midi,audio/x-midi" disabled={disabled || busy} className="hidden" onChange={(event)=>{const file=event.target.files?.[0];event.target.value="";if(file)void importFile(file);}} /></label>
        <button type="button" disabled={disabled || busy || !session?.midi?.tracks?.length} onClick={exportFile} className="inline-flex items-center gap-1.5 rounded-lg border border-[#d6a66a]/20 bg-[#d6a66a]/[0.05] px-2.5 py-1.5 text-[8px] text-[#efd29f]/65 disabled:opacity-20"><Download className="h-3 w-3" /> Export .mid</button>
      </div>
    </div>
    {message ? <div className="mt-2 text-[7px] text-emerald-100/45">{message}</div> : null}
    {error ? <div className="mt-2 rounded-lg border border-red-300/10 bg-red-400/[0.02] px-2 py-1.5 text-[7px] text-red-100/55">{error}</div> : null}
  </div>;
}
