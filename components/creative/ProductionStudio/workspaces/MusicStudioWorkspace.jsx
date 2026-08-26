"use client";

import { useState } from "react";
import { MicOff, Music2, RefreshCw, Scissors } from "lucide-react";

import MusicWorkspace from "./MusicWorkspace";
import MusicBackingTrackPanel from "./MusicBackingTrackPanel";
import MusicStemsPanel from "./MusicStemsPanel";
import MusicRemixPanel from "./MusicRemixPanel";

const MODES = Object.freeze([
  { id: "compose", label: "Compose", icon: Music2 },
  { id: "remix", label: "Remix", icon: RefreshCw },
  { id: "stems", label: "Stems", icon: Scissors },
  { id: "backing", label: "Backing Track", icon: MicOff },
]);

export default function MusicStudioWorkspace({ runtime, editor }) {
  const [mode, setMode] = useState("compose");
  const project = runtime.projectRuntime?.current || null;
  const mission = runtime.missionRuntime?.current || null;
  const organizationId = runtime.organizationId || null;

  return (
    <div className="min-h-full bg-[#080808]">
      <div className="sticky top-0 z-20 border-b border-white/7 bg-[#080808]/95 px-6 py-3 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.24em] text-[#d6a66a]/75">Avantiqo Music Studio</div>
            <div className="mt-1 text-xs text-white/32">Compose, remix, separate stems, or build performance backing tracks with the owned Music engine.</div>
          </div>
          <div className="flex rounded-xl border border-white/8 bg-black/35 p-1">
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

      {mode === "compose" ? (
        <MusicWorkspace runtime={runtime} editor={editor} />
      ) : mode === "remix" ? (
        <div className="mx-auto max-w-6xl p-6">
          <MusicRemixPanel
            organizationId={organizationId}
            projectId={project?.id || null}
            missionId={mission?.id || null}
          />
        </div>
      ) : mode === "stems" ? (
        <div className="mx-auto max-w-6xl p-6">
          <MusicStemsPanel
            organizationId={organizationId}
            projectId={project?.id || null}
            missionId={mission?.id || null}
          />
        </div>
      ) : (
        <div className="mx-auto max-w-6xl p-6">
          <MusicBackingTrackPanel
            organizationId={organizationId}
            projectId={project?.id || null}
            missionId={mission?.id || null}
            onComplete={() => runtime.refresh?.()}
          />
        </div>
      )}
    </div>
  );
}
