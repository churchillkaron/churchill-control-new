"use client";

import MissionExplorer from "../explorer/MissionExplorer";

function Section({
  title,
  items = [],
}) {
  if (!items.length) return null;

  return (
    <section className="mb-8">

      <div className="mb-3 text-[11px] uppercase tracking-[0.28em] text-[#8f8f8f]">
        {title}
      </div>

      <div className="space-y-2">

        {items.map(item => (

          <button
            key={item.id}
            type="button"
            onClick={() =>
              item.onClick?.()
            }
            className={[
              "w-full rounded-xl border px-4 py-3 text-left transition",
              item.active
                ? "border-[#c8a96a]/40 bg-[#c8a96a]/10"
                : "border-white/5 bg-white/[0.03] hover:bg-white/[0.06]"
            ].join(" ")}
          >

            <div className="flex items-center justify-between font-medium">

              <span>
                {item.title || item.name || item.id}
              </span>

              {item.completed && (
                <span className="text-xs text-[#c8a96a]">
                  ✓
                </span>
              )}

              {item.stageActive && (
                <span className="text-xs text-[#c8a96a]">
                  ●
                </span>
              )}

            </div>

            {item.description && (
              <div className="mt-1 text-xs text-white/45">
                {item.description}
              </div>
            )}

          </button>

        ))}

      </div>

    </section>
  );
}

export default function Sidebar({
  runtime,
  editor,
}) {

  const currentStage =
    runtime.stateRuntime?.current?.stage ||
    null;

  const stageMap = {
    mission: "MISSION_CREATED",
    brief: "UNDERSTANDING",
    research: "RESEARCHING",
    strategy: "BUILDING_STRATEGY",
    concept: "BUILDING_CONCEPT",
    storyboard: "BUILDING_STORYBOARD",
    production: "PRODUCING",
    render: "RENDERING",
    publishing: "PUBLISHING",
    learning: "LEARNING",
  };

  const pipelineStages = [
    "MISSION_CREATED",
    "UNDERSTANDING",
    "RESEARCHING",
    "BUILDING_STRATEGY",
    "BUILDING_CONCEPT",
    "BUILDING_STORYBOARD",
    "PRODUCING",
    "RENDERING",
    "PUBLISHING",
    "LEARNING",
  ];

  const currentIndex =
    pipelineStages.indexOf(
      currentStage
    );

  const workspaces =
    (runtime.workspaces || []).map(workspace => {

      const workspaceStage =
        stageMap[workspace.id];

      const stageIndex =
        pipelineStages.indexOf(
          workspaceStage
        );

      return {
        ...workspace,

        active:
          workspace.id ===
          editor.activeWorkspace,

        stageActive:
          workspaceStage ===
          currentStage,

        completed:
          stageIndex >= 0 &&
          currentIndex >= 0 &&
          stageIndex < currentIndex,

        onClick: () =>
          editor.setActiveWorkspace(
            workspace.id
          ),
      };

    });

  return (
    <div className="h-full overflow-y-auto px-5 py-6">

      <MissionExplorer
        runtime={runtime}
      />

      <Section
        title="Mission Pipeline"
        items={workspaces}
      />

    </div>
  );
}
