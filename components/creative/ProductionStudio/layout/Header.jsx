"use client";

import {
  Activity,
  ArrowRight,
  CircleDot,
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

export default function Header({ runtime, editor }) {
  const mission = runtime.missionRuntime?.current || null;
  const project = runtime.projectRuntime?.current || null;
  const stage = runtime.stateRuntime?.current?.stage || "MISSION_CREATED";
  const missionStatus = mission?.status || "draft";
  const objective =
    mission?.business_goal ||
    mission?.objective ||
    project?.objective ||
    "Create a new mission to start Creative Studio.";

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
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/35">
              <span className="flex items-center gap-2">
                <Activity className="h-3.5 w-3.5" />
                {stageCopy(stage)}
              </span>
              <span>{project?.name || "No active production yet"}</span>
              <span>{runtime.assetRuntime?.items?.length || 0} assets</span>
              <span>{runtime.taskRuntime?.items?.length || 0} tasks</span>
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

            <button
              type="button"
              onClick={() => editor.openMissionComposer?.()}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d5b56d]/35 bg-[#d5b56d]/12 px-4 text-xs font-semibold text-[#ead39a] transition hover:bg-[#d5b56d]/20"
            >
              <Sparkles className="h-3.5 w-3.5" />
              New mission
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
