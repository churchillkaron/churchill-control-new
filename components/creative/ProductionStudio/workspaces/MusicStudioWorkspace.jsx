"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AudioLines,
  CircleDot,
  Disc3,
  KeyboardMusic,
  Layers3,
  LayoutGrid,
  LockKeyhole,
  Mic2,
  MicOff,
  Music2,
  RefreshCw,
  Scissors,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  WandSparkles,
  Waves,
} from "lucide-react";

import MusicArrangementPanel from "./MusicArrangementPanel";
import MusicAutoStudioPanel from "./MusicAutoStudioPanel";
import MusicWorkspace from "./MusicWorkspace";
import MusicBackingTrackPanel from "./MusicBackingTrackPanel";
import MusicElasticAudioPanel from "./MusicElasticAudioPanel";
import MusicMasterStudioPanel from "./MusicMasterStudioPanel";
import MusicMidiStudioPanel from "./MusicMidiStudioPanel";
import MusicProducerPanel from "./MusicProducerPanel";
import MusicStemsPanel from "./MusicStemsPanel";
import MusicRemixPanel from "./MusicRemixPanel";
import MusicRecordingStudioPanel from "./MusicRecordingStudioPanel";
import MusicSpecialistStudioPanel from "./MusicSpecialistStudioPanel";
import MusicUnifiedWorkstationShell from "./MusicUnifiedWorkstationShell";

const MODES = Object.freeze([
  { id: "auto", label: "Auto", icon: Sparkles, group: "studio" },
  { id: "record", label: "Record", icon: Mic2, group: "studio" },
  { id: "workstation", label: "Workstation", icon: Layers3, group: "studio" },
  { id: "producer", label: "Producer", icon: WandSparkles, group: "studio" },
  { id: "arrange", label: "Arrange", icon: LayoutGrid, group: "studio" },
  { id: "midi", label: "MIDI", icon: KeyboardMusic, group: "studio" },
  { id: "elastic", label: "Elastic", icon: Waves, group: "studio" },
  { id: "compose", label: "Compose", icon: Music2, group: "ai" },
  { id: "remix", label: "Remix", icon: RefreshCw, group: "ai", planningOnly: true },
  { id: "edit", label: "Edit", icon: Scissors, group: "ai", planningOnly: true },
  { id: "extend", label: "Extend", icon: RefreshCw, group: "ai", planningOnly: true },
  { id: "stems", label: "Stems", icon: Scissors, group: "finish" },
  { id: "backing", label: "Backing", icon: MicOff, group: "finish" },
  { id: "vocal", label: "Vocal", icon: Mic2, group: "finish" },
  { id: "mix", label: "Mix", icon: SlidersHorizontal, group: "finish" },
  { id: "master", label: "Master", icon: Disc3, group: "finish" },
]);

const GROUPS = Object.freeze([
  { id: "studio", label: "Studio" },
  { id: "ai", label: "Owned AI" },
  { id: "finish", label: "Finish" },
]);

function statusLabel(status) {
  if (status === "ACTIVE") return "Ready";
  if (status === "PLANNING_ONLY") return "Planning only";
  if (status === "OWNED_RUNTIME_NOT_IMPLEMENTED") return "Owned runtime pending";
  if (status === "CERTIFICATION_GATED") return "Certification gated";
  return "Checking";
}

export default function MusicStudioWorkspace({ runtime, editor }) {
  const [mode, setMode] = useState("auto");
  const [readiness, setReadiness] = useState(null);
  const [readinessError, setReadinessError] = useState("");
  const project = runtime.projectRuntime?.current || null;
  const mission = runtime.missionRuntime?.current || null;
  const organizationId = runtime.organizationId || null;
  const specialistProps = {
    organizationId,
    projectId: project?.id || null,
    missionId: mission?.id || null,
  };

  useEffect(() => {
    if (!organizationId) {
      setReadiness(null);
      return undefined;
    }
    let cancelled = false;
    setReadinessError("");
    fetch("/api/creative/music/readiness", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization_id: organizationId }),
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || result.success === false) throw new Error(result.error || "Music readiness unavailable");
        return result;
      })
      .then((result) => {
        if (!cancelled) setReadiness(result);
      })
      .catch((error) => {
        if (!cancelled) {
          setReadiness(null);
          setReadinessError(error?.message || "Music readiness unavailable");
        }
      });
    return () => { cancelled = true; };
  }, [organizationId]);

  const composeReady = readiness?.capabilities?.compose?.ready === true;
  const composeStatus = readiness?.capabilities?.compose?.status || "CHECKING";
  const sfxStatus = readiness?.capabilities?.sfx?.status || "CHECKING";
  const ownedOnlySafe = readiness?.policy === "OWNED_ONLY"
    && readiness?.capabilities?.sfx?.external_fallback_enabled !== true
    && readiness?.capabilities?.sfx?.external_provider_active !== true;

  const modeState = useMemo(() => Object.fromEntries(MODES.map((item) => {
    if (item.planningOnly) return [item.id, { enabled: false, status: "PLANNING_ONLY" }];
    if (item.id === "compose") return [item.id, { enabled: composeReady, status: composeStatus }];
    return [item.id, { enabled: true, status: "STUDIO_TOOL" }];
  })), [composeReady, composeStatus]);

  return (
    <div className="min-h-full bg-[#070707] text-white">
      <div className="sticky top-0 z-20 border-b border-white/[0.07] bg-[#080808]/96 backdrop-blur-xl">
        <div className="px-5 py-4 lg:px-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.28em] text-[#d6a66a]/80">
                <AudioLines className="h-3.5 w-3.5" /> Avantiqo Music Studio
              </div>
              <div className="mt-1.5 text-lg font-medium tracking-[-0.02em] text-white/88">One studio. Real tools. Owned generation.</div>
              <div className="mt-1 max-w-xl text-xs leading-5 text-white/32">Record, arrange, produce, edit, separate, mix and master from one workspace. AI execution stays fail-closed until its owned runtime is production-ready.</div>
            </div>

            <div className="grid min-w-[320px] grid-cols-3 gap-2 text-[10px]">
              <div className={`rounded-xl border px-3 py-2.5 ${ownedOnlySafe ? "border-emerald-300/15 bg-emerald-300/[0.045] text-emerald-100/72" : "border-white/8 bg-white/[0.02] text-white/42"}`}>
                <ShieldCheck className="mb-1.5 h-3.5 w-3.5" />
                <div className="font-medium">Owned only</div>
                <div className="mt-0.5 text-[9px] opacity-60">{ownedOnlySafe ? "Fail-closed" : "Verifying"}</div>
              </div>
              <div className={`rounded-xl border px-3 py-2.5 ${composeReady ? "border-emerald-300/15 bg-emerald-300/[0.045] text-emerald-100/72" : "border-amber-300/15 bg-amber-300/[0.035] text-amber-100/65"}`}>
                {composeReady ? <CircleDot className="mb-1.5 h-3.5 w-3.5" /> : <LockKeyhole className="mb-1.5 h-3.5 w-3.5" />}
                <div className="font-medium">Compose</div>
                <div className="mt-0.5 text-[9px] opacity-60">{statusLabel(composeStatus)}</div>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 text-white/42">
                <LockKeyhole className="mb-1.5 h-3.5 w-3.5" />
                <div className="font-medium">SFX</div>
                <div className="mt-0.5 text-[9px] opacity-60">{statusLabel(sfxStatus)}</div>
              </div>
            </div>
          </div>

          {readinessError ? <div className="mt-3 rounded-lg border border-amber-300/15 bg-amber-300/[0.035] px-3 py-2 text-[10px] text-amber-100/58">Readiness check unavailable. Owned AI actions remain locked by default.</div> : null}
        </div>

        <div className="overflow-x-auto border-t border-white/[0.05] px-5 lg:px-7">
          <div className="flex min-w-max items-end gap-6 py-2.5">
            {GROUPS.map((group) => (
              <div key={group.id} className="flex items-end gap-1">
                <div className="mr-1.5 pb-2 pl-1 text-[8px] font-semibold uppercase tracking-[0.22em] text-white/18">{group.label}</div>
                {MODES.filter((item) => item.group === group.id).map((item) => {
                  const Icon = item.icon;
                  const active = mode === item.id;
                  const state = modeState[item.id];
                  const enabled = state?.enabled !== false;
                  const showGate = !enabled;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={!enabled}
                      title={showGate ? statusLabel(state?.status) : item.label}
                      onClick={() => enabled && setMode(item.id)}
                      className={`group relative flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] transition ${active ? "bg-[#d6a66a]/12 text-[#f0d39e]" : enabled ? "text-white/38 hover:bg-white/[0.04] hover:text-white/68" : "cursor-not-allowed text-white/16"}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{item.label}</span>
                      {showGate ? <LockKeyhole className="h-2.5 w-2.5 opacity-55" /> : null}
                      {active ? <span className="absolute inset-x-2 -bottom-2.5 h-px bg-[#d6a66a]/70" /> : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {mode === "auto" ? <MusicAutoStudioPanel {...specialistProps} />
      : mode === "record" ? <MusicRecordingStudioPanel {...specialistProps} onSaved={() => runtime.refresh?.()} />
      : mode === "workstation" ? <MusicUnifiedWorkstationShell organizationId={organizationId} projectId={project?.id || null} projectName={project?.name || project?.title || "Music Project"} />
      : mode === "producer" ? <MusicProducerPanel organizationId={organizationId} projectId={project?.id || null} />
      : mode === "arrange" ? <MusicArrangementPanel organizationId={organizationId} projectId={project?.id || null} />
      : mode === "midi" ? <MusicMidiStudioPanel organizationId={organizationId} projectId={project?.id || null} />
      : mode === "elastic" ? <MusicElasticAudioPanel organizationId={organizationId} projectId={project?.id || null} />
      : mode === "compose" && composeReady ? <MusicWorkspace runtime={runtime} editor={editor} />
      : mode === "remix" ? <div className="mx-auto max-w-6xl p-6"><MusicRemixPanel operation="remix" {...specialistProps} /></div>
      : mode === "edit" ? <div className="mx-auto max-w-6xl p-6"><MusicRemixPanel operation="edit" {...specialistProps} /></div>
      : mode === "extend" ? <div className="mx-auto max-w-6xl p-6"><MusicRemixPanel operation="extend" {...specialistProps} /></div>
      : mode === "stems" ? <div className="mx-auto max-w-6xl p-6"><MusicStemsPanel {...specialistProps} /></div>
      : mode === "backing" ? <div className="mx-auto max-w-6xl p-6"><MusicBackingTrackPanel {...specialistProps} onComplete={() => runtime.refresh?.()} /></div>
      : mode === "vocal" ? <MusicSpecialistStudioPanel mode="vocal" {...specialistProps} />
      : mode === "mix" ? <MusicSpecialistStudioPanel mode="mix" {...specialistProps} />
      : mode === "master" ? <MusicMasterStudioPanel organizationId={organizationId} projectId={project?.id || null} />
      : <div className="mx-auto max-w-6xl p-6"><div className="rounded-2xl border border-white/8 bg-black/25 p-6 text-xs text-white/40"><AudioLines className="mb-3 h-5 w-5 text-[#d6a66a]/70" />Music Studio mode unavailable.</div></div>}
    </div>
  );
}
