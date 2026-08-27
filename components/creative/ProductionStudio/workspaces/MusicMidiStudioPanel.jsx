"use client";

import { useEffect, useState } from "react";
import MusicMidiControlAutomationPanel from "./MusicMidiControlAutomationPanel";
import MusicMidiDrumSequencerPanel from "./MusicMidiDrumSequencerPanel";
import MusicMidiInstrumentPreviewPanel from "./MusicMidiInstrumentPreviewPanel";
import MusicMidiPianoRollPanel from "./MusicMidiPianoRollPanel";
import MusicSamplerPanel from "./MusicSamplerPanel";

export default function MusicMidiStudioPanel({ organizationId, projectId }) {
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    if (!organizationId || !projectId) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/creative/music/midi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "load",
          organization_id: organizationId,
          creative_project_id: projectId,
        }),
      });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error || "MIDI project could not load");
      setSession(body.session || null);
    } catch (cause) {
      setError(cause?.message || "MIDI project could not load");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); }, [organizationId, projectId]);

  if (!projectId) {
    return <div className="p-8 text-sm text-white/42">Open or create a Music project before using MIDI.</div>;
  }

  return (
    <div className="mx-auto max-w-[1500px] p-6">
      <div className="mb-4">
        <div className="text-[9px] font-semibold uppercase tracking-[0.24em] text-[#d6a66a]/70">Musician MIDI Workstation</div>
        <div className="mt-1 text-lg font-medium text-white/78">Piano Roll, Keyboard Performance, Drums, Sampler, Automation & Owned Instruments</div>
        <div className="mt-1 text-[10px] text-white/28">Shared Music project · {session?.bpm || 0} BPM · {session?.time_signature || "4/4"} · revision {session?.revision || 0}</div>
      </div>
      {error ? <div className="mb-3 rounded-xl border border-red-300/10 bg-red-400/[0.02] px-3 py-2 text-xs text-red-100/55">{error}</div> : null}
      {session ? (
        <>
          <MusicMidiPianoRollPanel
            organizationId={organizationId}
            projectId={projectId}
            session={session}
            disabled={busy}
            onReload={load}
          />
          <MusicMidiControlAutomationPanel
            organizationId={organizationId}
            projectId={projectId}
            session={session}
            disabled={busy}
            onReload={load}
          />
          <MusicMidiDrumSequencerPanel
            organizationId={organizationId}
            projectId={projectId}
            session={session}
            disabled={busy}
            onReload={load}
          />
          <MusicSamplerPanel
            organizationId={organizationId}
            projectId={projectId}
            session={session}
            disabled={busy}
            onReload={load}
          />
          <MusicMidiInstrumentPreviewPanel session={session} disabled={busy} />
        </>
      ) : (
        <div className="rounded-2xl border border-white/8 bg-black/25 p-6 text-xs text-white/35">{busy ? "Loading MIDI project…" : "MIDI project unavailable."}</div>
      )}
    </div>
  );
}
