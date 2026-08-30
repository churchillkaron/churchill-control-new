"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  AudioLines,
  ChevronLeft,
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
  {
    id: "compose",
    label: "Create a Song",
    shortLabel: "Create",
    description: "Generate original music from musical direction, structure and instrumentation.",
    icon: Music2,
    primary: true,
  },
  {
    id: "backing",
    label: "Make a Backing Track",
    shortLabel: "Backing Track",
    description: "Upload a song, remove vocals, change key or tempo, and export a performance-ready track.",
    icon: MicOff,
    primary: true,
  },
  {
    id: "record",
    label: "Record Audio",
    shortLabel: "Record",
    description: "Record vocals or instruments directly into the music project.",
    icon: Mic2,
    primary: true,
  },
  {
    id: "workstation",
    label: "Open Workstation",
    shortLabel: "Workstation",
    description: "Open the full timeline and production workspace for detailed work.",
    icon: Layers3,
    primary: true,
  },
  { id: "auto", label: "Auto Studio", shortLabel: "Auto", description: "Let Avantiqo coordinate the music workflow for you.", icon: Sparkles, section: "Create & shape" },
  { id: "producer", label: "Producer", shortLabel: "Producer", description: "Develop the production direction and sound.", icon: WandSparkles, section: "Create & shape" },
  { id: "arrange", label: "Arrangement", shortLabel: "Arrange", description: "Shape sections, structure and arrangement.", icon: LayoutGrid, section: "Create & shape" },
  { id: "midi", label: "MIDI", shortLabel: "MIDI", description: "Work with MIDI performance and composition tools.", icon: KeyboardMusic, section: "Create & shape" },
  { id: "elastic", label: "Time & Pitch", shortLabel: "Time & Pitch", description: "Adjust timing and pitch with elastic audio tools.", icon: Waves, section: "Edit" },
  { id: "remix", label: "Remix", shortLabel: "Remix", description: "Create a governed remix from existing material.", icon: RefreshCw, section: "Edit", planningOnly: true },
  { id: "edit", label: "AI Edit", shortLabel: "AI Edit", description: "Apply a governed AI music edit.", icon: Scissors, section: "Edit", planningOnly: true },
  { id: "extend", label: "Extend", shortLabel: "Extend", description: "Extend an existing piece of music.", icon: RefreshCw, section: "Edit", planningOnly: true },
  { id: "stems", label: "Separate Stems", shortLabel: "Stems", description: "Separate vocals, drums, bass and other instruments.", icon: Scissors, section: "Finish" },
  { id: "vocal", label: "Vocals", shortLabel: "Vocals", description: "Work on vocal production and finishing.", icon: Mic2, section: "Finish" },
  { id: "mix", label: "Mix", shortLabel: "Mix", description: "Balance and finish the mix.", icon: SlidersHorizontal, section: "Finish" },
  { id: "master", label: "Master", shortLabel: "Master", description: "Prepare the final release master.", icon: Disc3, section: "Finish" },
]);

const PRIMARY_MODE_IDS = Object.freeze(["compose", "backing", "record", "workstation"]);
const SECONDARY_SECTIONS = Object.freeze(["Create & shape", "Edit", "Finish"]);

function statusLabel(status) {
  if (status === "ACTIVE") return "Ready";
  if (status === "PLANNING_ONLY") return "Coming later";
  if (status === "OWNED_RUNTIME_NOT_IMPLEMENTED") return "Coming later";
  if (status === "CERTIFICATION_GATED") return "Temporarily unavailable";
  return "Checking";
}

function MusicGeneratorGate({ status }) {
  return (
    <section className="mx-auto max-w-6xl p-6 lg:p-8">
      <div className="overflow-hidden rounded-3xl border border-[#d6a66a]/20 bg-[radial-gradient(circle_at_top_right,rgba(214,166,106,0.11),transparent_38%)]">
        <div className="border-b border-white/7 px-6 py-7 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-[#d6a66a]">
                <Music2 className="h-4 w-4" /> Create a Song
              </div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white/90">Create original music</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/42">
                Choose the musical direction, structure, instrumentation, mood and tempo. Avantiqo handles the governed generation runtime behind the studio.
              </p>
            </div>
            <div className="rounded-full border border-amber-300/20 bg-amber-300/[0.06] px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-amber-100/70">
              {statusLabel(status)}
            </div>
          </div>
        </div>
        <div className="grid gap-4 p-6 sm:p-8 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/8 bg-black/25 p-5">
            <div className="text-[9px] uppercase tracking-[0.2em] text-white/28">1. Direction</div>
            <div className="mt-2 text-sm font-medium text-white/72">Style, mood & energy</div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-black/25 p-5">
            <div className="text-[9px] uppercase tracking-[0.2em] text-white/28">2. Music</div>
            <div className="mt-2 text-sm font-medium text-white/72">Structure, BPM & instruments</div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-black/25 p-5">
            <div className="text-[9px] uppercase tracking-[0.2em] text-white/28">3. Result</div>
            <div className="mt-2 text-sm font-medium text-white/72">Generate and save the track</div>
          </div>
        </div>
        <div className="border-t border-white/7 px-6 py-5 sm:px-8">
          <div className="flex items-start gap-3 rounded-2xl border border-amber-300/15 bg-amber-300/[0.035] p-4 text-amber-100/70">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="text-sm font-medium">Generation is temporarily unavailable</div>
              <div className="mt-1 text-xs leading-5 opacity-65">The tool stays visible, but execution remains locked until the owned music runtime reports ready.</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StudioHome({ modeState, composeReady, composeStatus, readinessError, onOpen }) {
  const primaryModes = PRIMARY_MODE_IDS.map((id) => MODES.find((item) => item.id === id)).filter(Boolean);

  return (
    <div className="mx-auto max-w-7xl px-5 py-7 lg:px-8 lg:py-10">
      <div className="max-w-3xl">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-[#d6a66a]/80">
          <AudioLines className="h-4 w-4" /> Avantiqo Music Studio
        </div>
        <h1 className="mt-4 text-3xl font-medium tracking-[-0.04em] text-white/92 sm:text-4xl">What do you want to do?</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/38">
          Start with the job you need. Advanced production tools stay available below when you need them.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px]">
          <span className={`rounded-full border px-3 py-1.5 ${composeReady ? "border-emerald-300/15 bg-emerald-300/[0.045] text-emerald-100/68" : "border-white/8 bg-white/[0.025] text-white/38"}`}>
            Music AI · {statusLabel(composeStatus)}
          </span>
          {readinessError ? <span className="rounded-full border border-amber-300/15 bg-amber-300/[0.04] px-3 py-1.5 text-amber-100/58">Readiness check unavailable</span> : null}
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {primaryModes.map((item) => {
          const Icon = item.icon;
          const state = modeState[item.id];
          const enabled = state?.enabled !== false;
          const gated = item.id === "compose" && !composeReady;
          return (
            <button
              key={item.id}
              type="button"
              disabled={!enabled}
              onClick={() => enabled && onOpen(item.id)}
              className="group flex min-h-[176px] flex-col justify-between rounded-[26px] border border-white/[0.08] bg-white/[0.025] p-5 text-left transition hover:border-[#d6a66a]/30 hover:bg-[#d6a66a]/[0.045] disabled:cursor-not-allowed disabled:opacity-45 sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="rounded-2xl border border-white/[0.08] bg-black/25 p-3 text-[#d6a66a]/82">
                  <Icon className="h-5 w-5" />
                </div>
                {gated ? <span className="rounded-full border border-amber-300/15 bg-amber-300/[0.04] px-2.5 py-1 text-[9px] uppercase tracking-[0.12em] text-amber-100/60">{statusLabel(composeStatus)}</span> : null}
              </div>
              <div className="mt-6">
                <div className="text-xl font-medium tracking-[-0.02em] text-white/84">{item.label}</div>
                <div className="mt-2 max-w-lg text-xs leading-5 text-white/35">{item.description}</div>
                <div className="mt-4 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[#d6a66a]/68">
                  Open <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-10 border-t border-white/[0.07] pt-8">
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/25">More tools</div>
        <div className="mt-5 space-y-7">
          {SECONDARY_SECTIONS.map((section) => (
            <section key={section}>
              <div className="mb-3 text-xs font-medium text-white/52">{section}</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {MODES.filter((item) => item.section === section).map((item) => {
                  const Icon = item.icon;
                  const state = modeState[item.id];
                  const enabled = state?.enabled !== false;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={!enabled}
                      onClick={() => enabled && onOpen(item.id)}
                      className="group rounded-2xl border border-white/[0.07] bg-black/20 p-4 text-left transition hover:border-white/[0.14] hover:bg-white/[0.025] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <Icon className="h-4 w-4 text-[#d6a66a]/62" />
                        {!enabled ? <LockKeyhole className="h-3 w-3 text-white/20" /> : null}
                      </div>
                      <div className="mt-4 text-sm font-medium text-white/68">{item.label}</div>
                      <div className="mt-1.5 text-[11px] leading-4 text-white/28">{enabled ? item.description : statusLabel(state?.status)}</div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MusicStudioWorkspace({ runtime, editor }) {
  const [mode, setMode] = useState("home");
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

  const modeState = useMemo(() => Object.fromEntries(MODES.map((item) => {
    if (item.planningOnly) return [item.id, { enabled: false, status: "PLANNING_ONLY" }];
    if (item.id === "compose") return [item.id, { enabled: true, status: composeStatus }];
    return [item.id, { enabled: true, status: "STUDIO_TOOL" }];
  })), [composeStatus]);

  const activeMode = MODES.find((item) => item.id === mode) || null;

  return (
    <div className="min-h-full bg-[#070707] text-white">
      {mode === "home" ? (
        <StudioHome
          modeState={modeState}
          composeReady={composeReady}
          composeStatus={composeStatus}
          readinessError={readinessError}
          onOpen={setMode}
        />
      ) : (
        <>
          <div className="sticky top-0 z-20 border-b border-white/[0.07] bg-[#080808]/96 backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 lg:px-7">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMode("home")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[11px] text-white/48 transition hover:border-white/[0.14] hover:text-white/75"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Music Studio
                </button>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-white/78">{activeMode?.label || "Music Tool"}</div>
                  <div className="mt-0.5 hidden truncate text-[10px] text-white/26 sm:block">{activeMode?.description || ""}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {PRIMARY_MODE_IDS.filter((id) => id !== mode).map((id) => {
                  const item = MODES.find((entry) => entry.id === id);
                  if (!item) return null;
                  const enabled = modeState[id]?.enabled !== false;
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={!enabled}
                      onClick={() => enabled && setMode(id)}
                      className="rounded-lg px-2.5 py-1.5 text-[10px] text-white/34 transition hover:bg-white/[0.04] hover:text-white/62 disabled:opacity-30"
                    >
                      {item.shortLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {mode === "compose" ? (composeReady
            ? <MusicWorkspace runtime={runtime} editor={editor} />
            : <MusicGeneratorGate status={composeStatus} />)
          : mode === "auto" ? <MusicAutoStudioPanel {...specialistProps} />
          : mode === "record" ? <MusicRecordingStudioPanel {...specialistProps} onSaved={() => runtime.refresh?.()} />
          : mode === "workstation" ? <MusicUnifiedWorkstationShell organizationId={organizationId} projectId={project?.id || null} projectName={project?.name || project?.title || "Music Project"} />
          : mode === "producer" ? <MusicProducerPanel organizationId={organizationId} projectId={project?.id || null} />
          : mode === "arrange" ? <MusicArrangementPanel organizationId={organizationId} projectId={project?.id || null} />
          : mode === "midi" ? <MusicMidiStudioPanel organizationId={organizationId} projectId={project?.id || null} />
          : mode === "elastic" ? <MusicElasticAudioPanel organizationId={organizationId} projectId={project?.id || null} />
          : mode === "remix" ? <div className="mx-auto max-w-6xl p-6"><MusicRemixPanel operation="remix" {...specialistProps} /></div>
          : mode === "edit" ? <div className="mx-auto max-w-6xl p-6"><MusicRemixPanel operation="edit" {...specialistProps} /></div>
          : mode === "extend" ? <div className="mx-auto max-w-6xl p-6"><MusicRemixPanel operation="extend" {...specialistProps} /></div>
          : mode === "stems" ? <div className="mx-auto max-w-6xl p-6"><MusicStemsPanel {...specialistProps} /></div>
          : mode === "backing" ? <div className="mx-auto max-w-6xl p-6"><MusicBackingTrackPanel {...specialistProps} onComplete={() => runtime.refresh?.()} /></div>
          : mode === "vocal" ? <MusicSpecialistStudioPanel mode="vocal" {...specialistProps} />
          : mode === "mix" ? <MusicSpecialistStudioPanel mode="mix" {...specialistProps} />
          : mode === "master" ? <MusicMasterStudioPanel organizationId={organizationId} projectId={project?.id || null} />
          : <div className="mx-auto max-w-6xl p-6"><div className="rounded-2xl border border-white/8 bg-black/25 p-6 text-xs text-white/40"><AudioLines className="mb-3 h-5 w-5 text-[#d6a66a]/70" />Music Studio tool unavailable.</div></div>}
        </>
      )}
    </div>
  );
}
