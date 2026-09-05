"use client";

import {
  Activity,
  ArrowRight,
  CircleDot,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

function titleCase(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function stageCopy(stage) {
  const key = String(stage || "MISSION_CREATED").toUpperCase();
  const copy = {
    MISSION_CREATED: "Goal defined",
    UNDERSTANDING: "Building brief",
    RESEARCHING: "Researching",
    BUILDING_STRATEGY: "Building strategy",
    BUILDING_CONCEPT: "Developing concept",
    WAITING_APPROVAL: "Awaiting decision",
    BUILDING_STORYBOARD: "Building storyboard",
    PLANNING_PRODUCTION: "Planning production",
    READY_FOR_EXECUTION: "Ready for approval",
    EXECUTING: "Starting production",
    PRODUCING: "Producing",
    RENDERING: "Rendering",
    REVIEWING: "Quality review",
    PUBLISHING: "Preparing release",
    MONITORING: "Monitoring release",
    LEARNING: "Learning",
    COMPLETED: "Completed",
  };
  return copy[key] || titleCase(key);
}

function phaseTone(status = "") {
  const value = String(status).toUpperCase();
  if (value === "COMPLETE") return "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100/75";
  if (value === "NEEDS_ATTENTION") return "border-red-300/20 bg-red-300/[0.06] text-red-100/75";
  if (value === "WAITING_APPROVAL") return "border-amber-300/20 bg-amber-300/[0.06] text-amber-100/75";
  if (["READY", "IN_PROGRESS"].includes(value)) return "border-[#d5b56d]/25 bg-[#d5b56d]/[0.07] text-[#ead39a]";
  return "border-white/10 bg-white/[0.04] text-white/45";
}

export default function Header({ runtime, editor }) {
  const mission = runtime.missionRuntime?.current || null;
  const project = runtime.projectRuntime?.current || null;
  const stage = runtime.stateRuntime?.current?.stage || "MISSION_CREATED";
  const orchestration = runtime.orchestrationRuntime?.current || null;
  const currentPhase = orchestration?.phases?.find(
    (phase) => phase.id === orchestration.current_phase,
  ) || null;
  const nextAction = orchestration?.next_action || null;
  const missionStatus = mission?.status || "draft";
  const objective =
    mission?.business_goal ||
    mission?.objective ||
    project?.objective ||
    "Create a new mission to start Creative Studio.";
  const startMission = runtime.commands?.find(
    (command) => command.id === "start_mission",
  );
  const canStart = Boolean(
    mission &&
    missionStatus !== "active" &&
    missionStatus !== "completed" &&
    missionStatus !== "archived" &&
    startMission?.onClick,
  );

  return (
    <header className="border-b border-white/10 bg-[#070706]">
      <div className="px-5 py-4 lg:px-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[#d7ba7c]">
                Avantiqo Creative Studio
              </div>
              <div className="h-3 w-px bg-white/15" />
              <div className="flex items-center gap-2 text-[11px] text-white/45">
                <CircleDot className="h-3.5 w-3.5 text-emerald-300/70" />
                Autonomous direction · governed execution
              </div>
            </div>

            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="max-w-4xl truncate text-xl font-semibold tracking-tight text-white lg:text-2xl">
                {objective}
              </h1>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/45">
                {missionStatus}
              </span>
              {currentPhase ? (
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${phaseTone(currentPhase.status)}`}>
                  {currentPhase.label} · {titleCase(currentPhase.status)}
                </span>
              ) : null}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/35">
              <span className="flex items-center gap-2">
                <Activity className="h-3.5 w-3.5" />
                {currentPhase?.detail || stageCopy(stage)}
              </span>
              <span>{project?.name || "No active production yet"}</span>
              {orchestration ? (
                <span>{orchestration.progress?.percent || 0}% film flow complete</span>
              ) : (
                <>
                  <span>{runtime.assetRuntime?.items?.length || 0} assets</span>
                  <span>{runtime.taskRuntime?.items?.length || 0} tasks</span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => runtime.refresh?.()}
              disabled={runtime.refreshing}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3.5 text-xs font-medium text-white/60 transition hover:bg-white/[0.07] hover:text-white disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${runtime.refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>

            <button
              type="button"
              onClick={() => editor.setActiveWorkspace("learning")}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3.5 text-xs font-medium text-white/60 transition hover:bg-white/[0.07] hover:text-white"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Evidence
            </button>

            {nextAction?.workspace && project ? (
              <button
                type="button"
                onClick={() => editor.setActiveWorkspace(nextAction.workspace)}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d5b56d]/35 bg-[#d5b56d]/12 px-4 text-xs font-semibold text-[#ead39a] transition hover:bg-[#d5b56d]/20"
                title={nextAction.reason || undefined}
              >
                {nextAction.label || "Continue film"}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : null}

            {canStart ? (
              <button
                type="button"
                onClick={() => startMission.onClick?.()}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-300/[0.07] px-4 text-xs font-semibold text-emerald-100/85 transition hover:bg-emerald-300/[0.12]"
              >
                <Play className="h-3.5 w-3.5" />
                Start planning
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => editor.openMissionComposer?.()}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 text-xs font-medium text-white/55 transition hover:bg-white/[0.07] hover:text-white"
            >
              <Sparkles className="h-3.5 w-3.5" />
              New mission
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
