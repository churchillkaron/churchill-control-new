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
import MusicProfessionalReleasePanel from "./MusicProfessionalReleasePanel";
import MusicStemsPanel from "./MusicStemsPanel";
import MusicRemixPanel from "./MusicRemixPanel";
import MusicRecordingStudioPanel from "./MusicRecordingStudioPanel";
import MusicSpecialistStudioPanel from "./MusicSpecialistStudioPanel";
import MusicUnifiedWorkstationShell from "./MusicUnifiedWorkstationShell";
import {
  listWorldClassMusicCapabilities,
  listWorldClassMusicWorkers,
} from "@/lib/creative/music/runtime/CreativeMusicWorldClassStudioRuntime";

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
  { id: "remix", label: "Remix", shortLabel: "Remix", description: "Create a governed remix from existing material.", icon: RefreshCw, section: "Edit" },
  { id: "edit", label: "AI Edit", shortLabel: "AI Edit", description: "Apply a governed surgical music edit.", icon: Scissors, section: "Edit" },
  { id: "extend", label: "Extend", shortLabel: "Extend", description: "Continue an existing piece with governed temporal outpainting.", icon: RefreshCw, section: "Edit" },
  { id: "stems", label: "Separate Stems", shortLabel: "Stems", description: "Separate vocals, drums, bass and other instruments.", icon: Scissors, section: "Finish" },
  { id: "vocal", label: "Vocals", shortLabel: "Vocals", description: "Work on vocal production and finishing.", icon: Mic2, section: "Finish" },
  { id: "mix", label: "Mix", shortLabel: "Mix", description: "Balance and finish the mix.", icon: SlidersHorizontal, section: "Finish" },
  { id: "master", label: "Master", shortLabel: "Master", description: "Prepare the final release master.", icon: Disc3, section: "Finish" },
]);

const PRIMARY_MODE_IDS = Object.freeze(["compose", "backing", "record", "workstation"]);
const SECONDARY_SECTIONS = Object.freeze(["Create & shape", "Edit", "Finish"]);
const WORLD_CLASS_CAPABILITIES = listWorldClassMusicCapabilities();
const WORLD_CLASS_WORKERS = listWorldClassMusicWorkers();
const WORLD_CLASS_FLOW = Object.freeze(["Brief", "Research", "Direction", "Concepts", "Pre-production", "Production", "Listening", "Edit", "Mix", "Master", "Tribunal", "Release"]);

function statusLabel(status) {
  if (status === "ACTIVE") return "Ready";
  if (status === "LOCAL_ACCEPTANCE_READY") return "Local test ready";
  if (status === "PLANNING_ONLY") return "Coming later";
  if (status === "OWNED_RUNTIME_NOT_IMPLEMENTED") return "Coming later";
  if (status === "CERTIFICATION_GATED") return "Temporarily unavailable";
  return "Checking";
}

function MusicGeneratorGate({ status }) {
  return (
    <section className="mx-auto max-w-[1800px] px-5 py-7 md:px-8 lg:px-10 lg:py-9">
      <div className="overflow-hidden rounded-[22px] border border-black/[0.075] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
        <div className="border-b border-black/[0.065] px-5 py-5 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-[#9A744B]">
                <Music2 className="h-3.5 w-3.5" /> Create a Song
              </div>
              <h2 className="mt-2 text-[24px] font-medium tracking-[-0.04em] text-[#1B1A18]">Create original music</h2>
              <p className="mt-1.5 max-w-2xl text-[11px] leading-5 text-[#817B73]">
                Set the musical direction, structure, instrumentation, mood and tempo. Avantiqo coordinates the governed generation runtime behind the studio.
              </p>
            </div>
            <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-amber-800">
              {statusLabel(status)}
            </div>
          </div>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-3 md:p-6">
          {[['1. Direction','Style, mood & energy'],['2. Music','Structure, BPM & instruments'],['3. Result','Generate and save the track']].map(([label,value]) => (
            <div key={label} className="rounded-xl border border-black/[0.06] bg-[#FCFBF8] p-4">
              <div className="text-[9px] font-semibold uppercase tracking-[0.13em] text-[#9A948B]">{label}</div>
              <div className="mt-1.5 text-[11px] font-semibold text-[#4A443D]">{value}</div>
            </div>
          ))}
        </div>
        <div className="border-t border-black/[0.06] bg-[#FCFBF8] px-5 py-4 md:px-6">
          <div className="flex items-start gap-2.5 text-[11px] text-[#817B73]">
            <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#A78158]" />
            <div><span className="font-semibold text-[#514B44]">Generation is temporarily unavailable.</span> The tool stays visible while the owned music runtime completes its readiness gate.</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StudioHome({ modeState, composeReady, composeStatus, readinessError, onOpen, organizationId, projectId, professionalReleaseRefreshKey }) {
  const primaryModes = PRIMARY_MODE_IDS.map((id) => MODES.find((item) => item.id === id)).filter(Boolean);

  return (
    <div className="mx-auto max-w-[1800px] px-5 py-7 md:px-8 lg:px-10 lg:py-9">
      <header className="flex flex-col gap-5 border-b border-black/[0.08] pb-7 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9A744B]">
              <AudioLines className="h-3.5 w-3.5" /> Avantiqo Music Studio
            </div>
            <span className="rounded-full border border-black/[0.08] bg-white px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#746E66]">
              {WORLD_CLASS_WORKERS.length} specialists
            </span>
          </div>
          <h1 className="mt-3 max-w-4xl text-[31px] font-medium tracking-[-0.045em] text-[#171614] md:text-[38px]">
            What do you want to make?
          </h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[#6F6A62]">
            Start with the outcome. Avantiqo brings in the right production workers, tools and quality gates behind the scenes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className={`rounded-full border px-3 py-1.5 text-[10px] ${composeReady ? "border-emerald-700/15 bg-emerald-50 text-emerald-800" : "border-black/[0.08] bg-white text-[#716C64]"}`}>
            Music AI · {statusLabel(composeStatus)}
          </span>
          {readinessError ? <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] text-amber-800">Readiness check unavailable</span> : null}
        </div>
      </header>

      <section className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {primaryModes.map((item) => {
          const Icon = item.icon;
          const state = modeState[item.id];
          const enabled = state?.enabled !== false;
          const gated = item.id === "compose" && !composeReady;
          return (
            <button key={item.id} type="button" disabled={!enabled} onClick={() => enabled && onOpen(item.id)}
              className="group flex min-h-[168px] flex-col justify-between rounded-[22px] border border-black/[0.075] bg-white p-5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.025)] transition hover:border-[#B98A57]/35 hover:bg-[#FCFAF6] disabled:cursor-not-allowed disabled:opacity-45">
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F5F2ED] text-[#A78158]">
                  <Icon className="h-4 w-4" />
                </div>
                {gated ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-amber-800">{statusLabel(composeStatus)}</span> : null}
              </div>
              <div className="mt-5">
                <div className="text-[17px] font-medium tracking-[-0.025em] text-[#25221E]">{item.label}</div>
                <div className="mt-1.5 text-[11px] leading-5 text-[#8A857D]">{item.description}</div>
                <div className="mt-3 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8A643C]">Open <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" /></div>
              </div>
            </button>
          );
        })}
      </section>

      <MusicProfessionalReleasePanel organizationId={organizationId} projectId={projectId} onOpen={onOpen} refreshKey={professionalReleaseRefreshKey} />

      <section className="mt-5 rounded-[22px] border border-black/[0.075] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.025)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#8D877E]">World-class production system</div>
            <h2 className="mt-1.5 text-[18px] font-medium tracking-[-0.03em] text-[#1B1A18]">One studio, specialist workers, one governed production flow</h2>
            <p className="mt-1 text-[11px] leading-5 text-[#8F8981]">Music Studio and Business Partner use the same production system. Avantiqo selects the workers and gates needed for the job instead of exposing provider prompts.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-[9px] text-[#756F67]">
            <span className="rounded-full bg-[#F5F2ED] px-2.5 py-1">{WORLD_CLASS_WORKERS.length} workers</span>
            <span className="rounded-full bg-[#F5F2ED] px-2.5 py-1">{WORLD_CLASS_CAPABILITIES.length} capability families</span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {WORLD_CLASS_FLOW.map((step, index) => <span key={step} className="rounded-lg border border-black/[0.06] bg-[#FCFBF8] px-2.5 py-1.5 text-[9px] text-[#817B73]">{index + 1}. {step}</span>)}
        </div>
      </section>

      <section className="mt-6 border-t border-black/[0.08] pt-6">
        <div className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#8D877E]">More tools</div>
        <div className="mt-4 space-y-6">
          {SECONDARY_SECTIONS.map((section) => (
            <div key={section}>
              <div className="mb-2.5 text-[11px] font-semibold text-[#625D55]">{section}</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                {MODES.filter((item) => item.section === section).map((item) => {
                  const Icon = item.icon;
                  const enabled = modeState[item.id]?.enabled !== false;
                  return (
                    <button key={item.id} type="button" disabled={!enabled} onClick={() => enabled && onOpen(item.id)}
                      className="group rounded-xl border border-black/[0.07] bg-white p-3.5 text-left transition hover:border-[#B98A57]/30 hover:bg-[#FCFAF6] disabled:cursor-not-allowed disabled:opacity-40">
                      <div className="flex items-center justify-between"><Icon className="h-3.5 w-3.5 text-[#A78158]" />{!enabled ? <LockKeyhole className="h-3 w-3 text-[#B8B2A8]" /> : null}</div>
                      <div className="mt-3 text-[11px] font-semibold text-[#413C36]">{item.label}</div>
                      <div className="mt-1 text-[10px] leading-4 text-[#9A948B]">{enabled ? item.description : statusLabel(modeState[item.id]?.status)}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function MusicStudioWorkspace({ runtime, editor }) {
  const [mode, setMode] = useState("home");
  const [readiness, setReadiness] = useState(null);
  const [professionalReleaseRevision, setProfessionalReleaseRevision] = useState(0);
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

  const composeReady = readiness?.capabilities?.compose?.ready === true || readiness?.capabilities?.compose?.live_acceptance_ready === true;
  const composeStatus = readiness?.capabilities?.compose?.status || "CHECKING";

  const modeState = useMemo(() => Object.fromEntries(MODES.map((item) => {
    if (item.id === "compose") return [item.id, { enabled: true, status: composeStatus }];
    if (["remix", "edit", "extend"].includes(item.id)) {
      const capability = readiness?.capabilities?.[item.id] || {};
      return [item.id, { enabled: true, status: capability.status || "BENCHMARK_REQUIRED", executable: capability.ready === true }];
    }
    return [item.id, { enabled: true, status: "STUDIO_TOOL" }];
  })), [composeStatus, readiness]);

  const activeMode = MODES.find((item) => item.id === mode) || null;

  return (
    <div className="min-h-full bg-[#F4F3EF] text-[#191919]">
      {mode === "home" ? (
        <StudioHome
          modeState={modeState}
          composeReady={composeReady}
          composeStatus={composeStatus}
          readinessError={readinessError}
          onOpen={setMode}
          organizationId={organizationId}
          projectId={project?.id || null}
          professionalReleaseRefreshKey={professionalReleaseRevision}
        />
      ) : (
        <>
          <div className="sticky top-0 z-20 border-b border-black/[0.08] bg-[#F4F3EF]/96 backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 lg:px-7">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMode("home")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[11px] font-medium text-[#625D55] transition hover:border-[#B98A57]/35 hover:text-[#8A643C]"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Music Studio
                </button>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[#2F2B27]">{activeMode?.label || "Music Tool"}</div>
                  <div className="mt-0.5 hidden truncate text-[10px] text-[#8D877F] sm:block">{activeMode?.description || ""}</div>
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
                      className="rounded-lg px-2.5 py-1.5 text-[10px] text-[#817B73] transition hover:bg-white hover:text-[#8A643C] disabled:opacity-30"
                    >
                      {item.shortLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {mode === "compose" ? (composeReady
            ? <MusicWorkspace runtime={runtime} editor={editor} onProfessionalReleaseStarted={() => { setProfessionalReleaseRevision((value) => value + 1); runtime.refresh?.(); setMode("home"); }} />
            : <MusicGeneratorGate status={composeStatus} />)
          : mode === "auto" ? <MusicAutoStudioPanel {...specialistProps} />
          : mode === "record" ? <MusicRecordingStudioPanel {...specialistProps} onSaved={() => runtime.refresh?.()} />
          : mode === "workstation" ? <MusicUnifiedWorkstationShell organizationId={organizationId} projectId={project?.id || null} projectName={project?.name || project?.title || "Music Project"} onProfessionalReleaseAdvanced={() => { setProfessionalReleaseRevision((value) => value + 1); runtime.refresh?.(); setMode("home"); }} />
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
          : <div className="mx-auto max-w-6xl p-6"><div className="rounded-[22px] border border-black/[0.07] bg-white p-6 text-xs text-[#817B73]"><AudioLines className="mb-3 h-5 w-5 text-[#A78158]" />Music Studio tool unavailable.</div></div>}
        </>
      )}
    </div>
  );
}
