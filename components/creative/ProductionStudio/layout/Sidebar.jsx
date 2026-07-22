"use client";

import MissionExplorer from "../explorer/MissionExplorer";

import {
  resolveCreativeProductDefinition,
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
              <span>
                {item.title || item.name || item.id}
              </span>

              {item.completed ? (
                <span className="text-xs text-[#c8a96a]">
                  ✓
                </span>
              ) : null}

              {item.stageActive ? (
                <span className="text-xs text-[#c8a96a]">
                  ●
                </span>
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

function resolveProductType(runtime) {
  const project = runtime.projectRuntime?.current || {};
  const mission = runtime.missionRuntime?.current || {};

  return (
    project.product_type ||
    project.deliverable_type ||
    project.metadata?.product_type ||
    project.metadata?.deliverable_type ||
    mission.product_type ||
    mission.metadata?.product_type ||
    "FILM"
  );
}

export default function Sidebar({
  runtime,
  editor,
}) {
  const currentStage =
    runtime.stateRuntime?.current?.stage ||
    null;
  const product = resolveCreativeProductDefinition(
    resolveProductType(runtime),
  );
  const availableWorkspaces = new Map(
    (runtime.workspaces || []).map((workspace) => [
      workspace.id,
      workspace,
    ]),
  );
  const configuredWorkflow = product.workflow || [];
  const workflow = configuredWorkflow
    .map((definition) => {
      const available = availableWorkspaces.get(definition.id);

      if (!available) return null;

      return {
        ...available,
        ...definition,
        title: definition.title || available.title,
        description:
          available.description ||
          definition.description ||
          null,
      };
    })
    .filter(Boolean);
  const fallbackWorkflow = runtime.workspaces || [];
  const resolvedWorkflow = workflow.length
    ? workflow
    : fallbackWorkflow;
  const pipelineStages = resolvedWorkflow
    .map((workspace) => workspace.stage)
    .filter(Boolean);
  const currentIndex = pipelineStages.indexOf(currentStage);

  const workspaces = resolvedWorkflow.map((workspace) => {
    const stageIndex = pipelineStages.indexOf(workspace.stage);

    return {
      ...workspace,
      active:
        workspace.id ===
        editor.activeWorkspace,
      stageActive:
        Boolean(workspace.stage) &&
        workspace.stage === currentStage,
      completed:
        stageIndex >= 0 &&
        currentIndex >= 0 &&
        stageIndex < currentIndex,
      onClick: () =>
        editor.setActiveWorkspace(
          workspace.id,
        ),
    };
  });

  return (
    <div className="h-full overflow-y-auto px-5 py-6">
      <MissionExplorer runtime={runtime} />

      <div className="mb-5 rounded-xl border border-white/5 bg-white/[0.025] px-4 py-3">
        <div className="text-[10px] uppercase tracking-[0.24em] text-white/30">
          Creative Product
        </div>
        <div className="mt-1 text-sm font-medium text-white/75">
          {product.title}
        </div>
      </div>

      <Section
        title={`${product.title} Workflow`}
        items={workspaces}
      />
    </div>
  );
}
