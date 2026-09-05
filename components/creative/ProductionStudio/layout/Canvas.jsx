"use client";

import { ChevronRight } from "lucide-react";
import WorkspaceCanvasRouter from "./WorkspaceCanvasRouter";

const FILM_WORKSPACE_LABELS = {
  production: "Production",
  timeline: "Edit",
  review: "Review",
  render: "Mastering",
  publishing: "Release",
};

function titleCase(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

export default function Canvas({ runtime, editor }) {
  const mission = runtime.missionRuntime?.current || null;
  const orchestration = runtime.orchestrationRuntime?.current || null;
  const workspaceTitle =
    FILM_WORKSPACE_LABELS[editor.activeWorkspace] ||
    runtime.workspaces?.find((item) => item.id === editor.activeWorkspace)?.title ||
    runtime.workspace?.title ||
    "Creative Studio";
  const currentPhase = orchestration?.phases?.find(
    (phase) => phase.id === orchestration.current_phase,
  ) || null;
  const filmWorkspace = Boolean(FILM_WORKSPACE_LABELS[editor.activeWorkspace]);

  return (
    <section className="flex h-full min-h-0 flex-col bg-[#050505]">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/8 bg-[#070706] px-5 py-3 lg:px-7">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <span className="text-white/28">Studio</span>
          <ChevronRight className="h-3 w-3 text-white/18" />
          <span className="max-w-[220px] truncate text-white/38 sm:max-w-[360px]">
            {mission?.title || mission?.business_goal || "Mission"}
          </span>
          <ChevronRight className="h-3 w-3 text-white/18" />
          <span className="font-medium text-white/68">{workspaceTitle}</span>
        </div>

        <div className="hidden text-[10px] uppercase tracking-[0.18em] text-white/22 sm:block">
          {filmWorkspace && currentPhase
            ? `${currentPhase.label} · ${titleCase(currentPhase.status)}`
            : runtime.stateRuntime?.current?.stage || "MISSION_CREATED"}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <WorkspaceCanvasRouter runtime={runtime} editor={editor} />
      </div>
    </section>
  );
}
