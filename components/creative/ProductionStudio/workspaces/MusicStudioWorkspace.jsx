"use client";

import { useState } from "react";
import {
  AudioLines,
  Disc3,
  KeyboardMusic,
  Layers3,
  LayoutGrid,
  Mic2,
  MicOff,
  Music2,
  RefreshCw,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  WandSparkles,
} from "lucide-react";

import MusicArrangementPanel from "./MusicArrangementPanel";
import MusicAutoStudioPanel from "./MusicAutoStudioPanel";
import MusicWorkspace from "./MusicWorkspace";
import MusicBackingTrackPanel from "./MusicBackingTrackPanel";
import MusicMasterStudioPanel from "./MusicMasterStudioPanel";
import MusicMidiStudioPanel from "./MusicMidiStudioPanel";
import MusicProducerPanel from "./MusicProducerPanel";
import MusicStemsPanel from "./MusicStemsPanel";
import MusicRemixPanel from "./MusicRemixPanel";
import MusicRecordingStudioPanel from "./MusicRecordingStudioPanel";
import MusicSpecialistStudioPanel from "./MusicSpecialistStudioPanel";
import MusicUnifiedWorkstationShell from "./MusicUnifiedWorkstationShell";

const MODES = Object.freeze([
  { id: "auto", label: "Auto Studio", icon: Sparkles },
  { id: "record", label: "Record", icon: Mic2 },
  { id: "workstation", label: "Workstation", icon: Layers3 },
  { id: "producer", label: "Producer", icon: WandSparkles },
  { id: "arrange", label: "Arrange", icon: LayoutGrid },
  { id: "midi", label: "MIDI / Piano Roll", icon: KeyboardMusic },
  { id: "compose", label: "Compose", icon: Music2 },
  { id: "remix", label: "Remix", icon: RefreshCw },
  { id: "edit", label: "Edit / Repaint", icon: Scissors },
  { id: "extend", label: "Extend", icon: RefreshCw },
  { id: "stems", label: "Stems", icon: Scissors },
  { id: "backing", label: "Backing Track", icon: MicOff },
  { id: "vocal", label: "Vocal Studio", icon: Mic2 },
  { id: "mix", label: "Mix Studio", icon: SlidersHorizontal },
  { id: "master", label: "Master Studio", icon: Disc3 },
]);

export default function MusicStudioWorkspace({ runtime, editor }) {
  const [mode, setMode] = useState("auto");
  const project = runtime.projectRuntime?.current || null;
  const mission = runtime.missionRuntime?.current || null;
  const organizationId = runtime.organizationId || null;
  const specialistProps = {
    organizationId,
    projectId: project?.id || null,
    missionId: mission?.id || null,
  };

  return (
    <div className="min-h-full bg-[#080808]">
      <div className="sticky top-0 z-20 border-b border-white/7 bg-[#080808]/95 px-6 py-3 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.24em] text-[#d6a66a]/75">Avantiqo Music Studio</div>
            <div className="mt-1 text-xs text-white/32">Record, arrange, engineer, perform with MIDI, produce, repair, mix and master real music — or compose with the owned Music engine.</div>
          </div>
          <div className="flex flex-wrap rounded-xl border border-white/8 bg-black/35 p-1">
            {MODES.map((item) => {
              const Icon = item.icon;
              const active = mode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMode(item.id)}
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs transition ${active ? "bg-[#d6a66a]/12 text-[#efd29f]" : "text-white/38 hover:bg-white/[0.04] hover:text-white/68"}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {mode === "auto" ? (
        <MusicAutoStudioPanel {...specialistProps} />
      ) : mode === "record" ? (
        <MusicRecordingStudioPanel {...specialistProps} onSaved={() => runtime.refresh?.()} />
      ) : mode === "workstation" ? (
        <MusicUnifiedWorkstationShell
          organizationId={organizationId}
          projectId={project?.id || null}
          projectName={project?.name || project?.title || "Music Project"}
        />
      ) : mode === "producer" ? (
        <MusicProducerPanel
          organizationId={organizationId}
          projectId={project?.id || null}
        />
      ) : mode === "arrange" ? (
        <MusicArrangementPanel
          organizationId={organizationId}
          projectId={project?.id || null}
        />
      ) : mode === "midi" ? (
        <MusicMidiStudioPanel
          organizationId={organizationId}
          projectId={project?.id || null}
        />
      ) : mode === "compose" ? (
        <MusicWorkspace runtime={runtime} editor={editor} />
      ) : mode === "remix" ? (
        <div className="mx-auto max-w-6xl p-6">
          <MusicRemixPanel operation="remix" {...specialistProps} />
        </div>
      ) : mode === "edit" ? (
        <div className="mx-auto max-w-6xl p-6">
          <MusicRemixPanel operation="edit" {...specialistProps} />
        </div>
      ) : mode === "extend" ? (
        <div className="mx-auto max-w-6xl p-6">
          <MusicRemixPanel operation="extend" {...specialistProps} />
        </div>
      ) : mode === "stems" ? (
        <div className="mx-auto max-w-6xl p-6">
          <MusicStemsPanel {...specialistProps} />
        </div>
      ) : mode === "backing" ? (
        <div className="mx-auto max-w-6xl p-6">
          <MusicBackingTrackPanel
            {...specialistProps}
            onComplete={() => runtime.refresh?.()}
          />
        </div>
      ) : mode === "vocal" ? (
        <MusicSpecialistStudioPanel mode="vocal" {...specialistProps} />
      ) : mode === "mix" ? (
        <MusicSpecialistStudioPanel mode="mix" {...specialistProps} />
      ) : mode === "master" ? (
        <MusicMasterStudioPanel
          organizationId={organizationId}
          projectId={project?.id || null}
        />
      ) : (
        <div className="mx-auto max-w-6xl p-6">
          <div className="rounded-2xl border border-white/8 bg-black/25 p-6 text-xs text-white/40">
            <AudioLines className="mb-3 h-5 w-5 text-[#d6a66a]/70" />
            Music Studio mode unavailable.
          </div>
        </div>
      )}
    </div>
  );
}
