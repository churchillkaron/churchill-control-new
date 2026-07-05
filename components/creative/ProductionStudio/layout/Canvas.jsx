"use client";

import RunProductionButton from "../actions/RunProductionButton";
import RunCreativePipelineButton from "../actions/RunCreativePipelineButton";
import PipelineStatusCard from "../status/PipelineStatusCard";
import CreateButtons from "../actions/CreateButtons";
import ProductionGraph from "../canvas/ProductionGraph";

function Action({ children }) {
  return (
    <button className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 transition hover:bg-white/[0.08]">
      {children}
    </button>
  );
}

export default function Canvas({ runtime, editor }) {

  const project = runtime.projectRuntime?.project;

  const getList = (key) => {
    if (typeof runtime.get === "function") {
      return runtime.get(key);
    }
    return [];
  };

  const scenes = getList("scenes");
  const shots = getList("shots");
  const tasks = getList("tasks");
  const assets = getList("assets");

  return (
    <section className="flex h-full flex-col overflow-hidden bg-[#05070d]">

      <header className="border-b border-white/10 px-8 py-6">

        <div className="flex items-start justify-between">

          <div>
            <div className="text-xs uppercase tracking-[0.30em] text-cyan-300">
              Creative Production Studio
            </div>

            <h2 className="mt-2 text-3xl font-semibold">
              {project?.name || "Creative Project"}
            </h2>

            <div className="mt-4 flex gap-6 text-sm text-white/50">
              <span>Scenes <strong className="text-white">{scenes.length}</strong></span>
              <span>Shots <strong className="text-white">{shots.length}</strong></span>
              <span>Tasks <strong className="text-white">{tasks.length}</strong></span>
              <span>Assets <strong className="text-white">{assets.length}</strong></span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">

            <CreateButtons runtime={{ ...runtime, editor }} />

            <Action>+ Task</Action>
            <Action>+ Asset</Action>

            <RunCreativePipelineButton runtime={runtime} />

            <PipelineStatusCard
              organizationId={runtime.organizationId}
              projectId={runtime.projectRuntime?.project?.id}
            />

            <RunProductionButton runtime={runtime} />
          </div>

        </div>

      </header>

      <div className="flex-1 overflow-auto p-8">
        <ProductionGraph runtime={runtime} editor={editor} />
      </div>

    </section>
  );
}
