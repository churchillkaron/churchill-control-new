"use client";

import {
  BookOpen,
  Boxes,
  Clapperboard,
  FileText,
  FlaskConical,
  Frame,
  Images,
  Lightbulb,
  LineChart,
  MessageSquareText,
  Music2,
  PackageCheck,
  Rocket,
  ScrollText,
  Sparkles,
} from "lucide-react";

const WORKSPACE_META = {
  mission: { label: "Mission", group: "Direction", icon: Sparkles },
  brief: { label: "Brief", group: "Direction", icon: FileText },
  research: { label: "Research", group: "Direction", icon: FlaskConical },
  strategy: { label: "Strategy", group: "Direction", icon: LineChart },
  concept: { label: "Concept", group: "Direction", icon: Lightbulb },
  storyboard: { label: "Storyboard", group: "Production", icon: Frame },
  production: { label: "Production", group: "Film flow", icon: Clapperboard },
  music: { label: "Music", group: "Production", icon: Music2 },
  assets: { label: "Assets", group: "Production", icon: Images },
  timeline: { label: "Edit", group: "Film flow", icon: ScrollText },
  review: { label: "Review", group: "Film flow", icon: MessageSquareText },
  render: { label: "Mastering", group: "Film flow", icon: Boxes },
  publishing: { label: "Release", group: "Film flow", icon: Rocket },
  documents: { label: "Documents", group: "Evidence", icon: BookOpen },
  learning: { label: "Learning", group: "Evidence", icon: PackageCheck },
};

const STAGE_ORDER = [
  "MISSION_CREATED",
  "UNDERSTANDING",
  "RESEARCHING",
  "BUILDING_STRATEGY",
  "BUILDING_CONCEPT",
  "WAITING_APPROVAL",
  "BUILDING_STORYBOARD",
  "PLANNING_PRODUCTION",
  "READY_FOR_EXECUTION",
  "EXECUTING",
  "PRODUCING",
  "RENDERING",
  "REVIEWING",
  "PUBLISHING",
  "MONITORING",
  "LEARNING",
  "COMPLETED",
];

const STAGE_BY_WORKSPACE = {
  mission: "MISSION_CREATED",
  brief: "UNDERSTANDING",
  research: "RESEARCHING",
  strategy: "BUILDING_STRATEGY",
  concept: "BUILDING_CONCEPT",
  storyboard: "BUILDING_STORYBOARD",
  music: "PLANNING_PRODUCTION",
  learning: "LEARNING",
};

const ORCHESTRATED_WORKSPACE_PHASE = {
  production: "production",
  timeline: "edit",
  review: "review",
  render: "mastering",
  publishing: "release",
};

function phaseCopy(phase) {
  const status = String(phase?.status || "").toUpperCase();
  if (status === "COMPLETE") return "Evidence complete";
  if (status === "READY") return "Ready for action";
  if (status === "WAITING_APPROVAL") return "Approval required";
  if (status === "IN_PROGRESS") return "In progress";
  if (status === "NEEDS_ATTENTION") return "Needs attention";
  if (status === "BLOCKED") return "Blocked downstream";
  if (status === "NOT_STARTED") return "Not started";
  return phase?.detail || "Workspace";
}

function groupItems(workspaces, currentStage, editor, orchestration) {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  const groups = ["Direction", "Production", "Film flow", "Evidence"];
  const grouped = Object.fromEntries(groups.map((group) => [group, []]));
  const phaseById = new Map(
    (orchestration?.phases || []).map((phase) => [phase.id, phase]),
  );

  for (const workspace of workspaces) {
    const meta = WORKSPACE_META[workspace.id];
    if (!meta) continue;

    const orchestratedPhaseId = ORCHESTRATED_WORKSPACE_PHASE[workspace.id];
    const orchestratedPhase = orchestratedPhaseId
      ? phaseById.get(orchestratedPhaseId) || null
      : null;
    const workspaceStage = STAGE_BY_WORKSPACE[workspace.id];
    const stageIndex = STAGE_ORDER.indexOf(workspaceStage);
    const oldStageActive = workspaceStage === currentStage;
    const oldCompleted =
      stageIndex >= 0 && currentIndex >= 0 && stageIndex < currentIndex;

    grouped[meta.group].push({
      ...workspace,
      ...meta,
      active: editor.activeWorkspace === workspace.id,
      stageActive: orchestratedPhase
        ? orchestration?.current_phase === orchestratedPhase.id
        : oldStageActive,
      completed: orchestratedPhase
        ? orchestratedPhase.status === "COMPLETE"
        : oldCompleted,
      phaseStatus: orchestratedPhase?.status || null,
      phaseCopy: orchestratedPhase ? phaseCopy(orchestratedPhase) : null,
    });
  }

  return grouped;
}

function NavItem({ item, onClick }) {
  const Icon = item.icon;
  const needsAttention = item.phaseStatus === "NEEDS_ATTENTION";
  const waitingApproval = item.phaseStatus === "WAITING_APPROVAL";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
        item.active
          ? "bg-[#d6b66f]/12 text-[#efd79e]"
          : "text-white/48 hover:bg-white/[0.045] hover:text-white/80"
      }`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
          item.active
            ? "border-[#d6b66f]/25 bg-[#d6b66f]/10"
            : needsAttention
              ? "border-red-300/15 bg-red-300/[0.04]"
              : "border-white/8 bg-white/[0.025]"
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{item.label}</div>
        <div className={`mt-0.5 truncate text-[10px] ${needsAttention ? "text-red-200/55" : waitingApproval ? "text-amber-200/55" : "text-white/25"}`}>
          {item.phaseCopy || (item.stageActive ? "Current stage" : item.completed ? "Evidence ready" : "Workspace")}
        </div>
      </div>
      {item.stageActive ? (
        <span className="h-1.5 w-1.5 rounded-full bg-[#d6b66f]" />
      ) : item.completed ? (
        <span className="text-[10px] text-emerald-300/65">✓</span>
      ) : needsAttention ? (
        <span className="h-1.5 w-1.5 rounded-full bg-red-300/70" />
      ) : waitingApproval ? (
        <span className="h-1.5 w-1.5 rounded-full bg-amber-300/70" />
      ) : null}
    </button>
  );
}

export default function Sidebar({ runtime, editor }) {
  const currentStage = runtime.stateRuntime?.current?.stage || "MISSION_CREATED";
  const orchestration = runtime.orchestrationRuntime?.current || null;
  const groups = groupItems(
    runtime.workspaces || [],
    currentStage,
    editor,
    orchestration,
  );
  const mission = runtime.missionRuntime?.current || null;

  return (
    <div className="flex h-full flex-col bg-[#080807]">
      <div className="border-b border-white/8 p-4">
        <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-3.5">
          <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/30">
            Current mission
          </div>
          <div className="mt-2 line-clamp-2 text-sm font-medium leading-5 text-white/80">
            {mission?.title || mission?.business_goal || "No active mission"}
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] text-white/30">
            <span>{mission?.status || "draft"}</span>
            <span>
              {orchestration
                ? `${orchestration.progress?.completed_count || 0}/${orchestration.progress?.total_count || 5} film phases`
                : `${runtime.projectRuntime?.items?.length || 0} deliverables`}
            </span>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {Object.entries(groups).map(([group, items]) =>
          items.length ? (
            <section key={group} className="mb-6">
              <div className="mb-2 px-2 text-[9px] font-semibold uppercase tracking-[0.24em] text-white/25">
                {group}
              </div>
              <div className="space-y-1">
                {items.map((item) => (
                  <NavItem
                    key={item.id}
                    item={item}
                    onClick={() => editor.setActiveWorkspace(item.id)}
                  />
                ))}
              </div>
            </section>
          ) : null,
        )}
      </div>
    </div>
  );
}
