"use client";

import MissionExplorer from "../explorer/MissionExplorer";

import {
  resolveCreativeMissionDefinition,
} from "@/lib/creative/products/CreativeProductRegistry";

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
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => item.onClick?.()}
            className={[
              "w-full rounded-xl border px-4 py-3 text-left transition",
              item.active
                ? "border-[#c8a96a]/40 bg-[#c8a96a]/10"
                : "border-white/5 bg-white/[0.03] hover:bg-white/[0.06]",
            ].join(" ")}
          >
            <div className="flex items-center justify-between font-medium">
              <span>{item.title || item.name || item.id}</span>

              {item.completed ? (
                <span className="text-xs text-[#c8a96a]">✓</span>
              ) : null}

              {item.stageActive ? (
                <span className="text-xs text-[#c8a96a]">●</span>
              ) : null}
            </div>

            {item.description ? (
              <div className="mt-1 text-xs text-white/45">
                {item.description}
              </div>
            ) : null}
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
  const missionDefinition = resolveCreativeMissionDefinition(runtime);
  const availableWorkspaces = new Map(
    (runtime.workspaces || []).map((workspace) => [
      workspace.id,
      workspace,
    ]),
  );
  const workflow = (missionDefinition.workflow || [])
    .map((definition) => {
      const workspaceId =
        definition.workspace_id ||
        definition.id;
      const available = availableWorkspaces.get(workspaceId);

      if (!available) return null;

      return {
        ...available,
        ...definition,
        id: workspaceId,
        workspace_id: workspaceId,
        title: definition.title || available.title,
        description:
          definition.description ||
          available.description ||
          null,
      };
    })
    .filter(Boolean);
  const resolvedWorkflow = workflow.length
    ? workflow
    : runtime.workspaces || [];
  const currentIndex = resolvedWorkflow.findIndex(
    (workspace) => workspace.stage === currentStage,
  );

  const workspaces = resolvedWorkflow.map((workspace, index) => ({
    ...workspace,
    active: workspace.id === editor.activeWorkspace,
    stageActive:
      Boolean(workspace.stage) &&
      workspace.stage === currentStage,
    completed:
      currentIndex >= 0 &&
      index < currentIndex,
    onClick: () => editor.setActiveWorkspace(workspace.id),
  }));

  return (
    <div className="h-full overflow-y-auto px-5 py-6">
      <MissionExplorer runtime={runtime} />

      {missionDefinition.creative_thesis ? (
        <div className="mb-5 rounded-xl border border-white/5 bg-white/[0.025] px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.24em] text-white/30">
            Creative Thesis
          </div>
          <div className="mt-2 text-sm leading-6 text-white/70">
            {missionDefinition.creative_thesis}
          </div>
        </div>
      ) : null}

      <Section
        title="Mission Workflow"
        items={workspaces}
      />
    </div>
  );
}
