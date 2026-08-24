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
  production: { label: "Production", group: "Production", icon: Clapperboard },
  music: { label: "Music", group: "Production", icon: Music2 },
  assets: { label: "Assets", group: "Production", icon: Images },
  timeline: { label: "Timeline", group: "Production", icon: ScrollText },
  render: { label: "Render", group: "Release", icon: Boxes },
  publishing: { label: "Publishing", group: "Release", icon: Rocket },
  documents: { label: "Documents", group: "Release", icon: BookOpen },
  learning: { label: "Learning", group: "Release", icon: PackageCheck },
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
  production: "PLANNING_PRODUCTION",
  music: "PLANNING_PRODUCTION",
  render: "RENDERING",
  publishing: "PUBLISHING",
  learning: "LEARNING",
};

function groupItems(workspaces, currentStage, editor) {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  const grouped = { Direction: [], Production: [], Release: [] };

  for (const workspace of workspaces) {
    const meta = WORKSPACE_META[workspace.id];
    if (!meta) continue;

    const workspaceStage = STAGE_BY_WORKSPACE[workspace.id];
    const stageIndex = STAGE_ORDER.indexOf(workspaceStage);
    grouped[meta.group].push({
      ...workspace,
      ...meta,
      active: editor.activeWorkspace === workspace.id,
      stageActive: workspaceStage === currentStage,
      completed:
        stageIndex >= 0 && currentIndex >= 0 && stageIndex < currentIndex,
    });
  }

  return grouped;
}

function NavItem({ item, onClick }) {
  const Icon = item.icon;
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
            : "border-white/8 bg-white/[0.025]"
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{item.label}</div>
        <div className="mt-0.5 text-[10px] text-white/25">
          {item.stageActive ? "Current stage" : item.completed ? "Evidence ready" : "Workspace"}
        </div>
      </div>
      {item.stageActive ? (
        <span className="h-1.5 w-1.5 rounded-full bg-[#d6b66f]" />
      ) : item.completed ? (
        <span className="text-[10px] text-emerald-300/65">✓</span>
      ) : null}
    </button>
  );
}

export default function Sidebar({ runtime, editor }) {
  const currentStage = runtime.stateRuntime?.current?.stage || "MISSION_CREATED";
  const groups = groupItems(runtime.workspaces || [], currentStage, editor);
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
            <span>{runtime.projectRuntime?.items?.length || 0} deliverables</span>
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
