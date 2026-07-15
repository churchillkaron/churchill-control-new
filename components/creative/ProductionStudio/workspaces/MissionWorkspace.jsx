"use client";

export default function MissionWorkspace({
  runtime,
  editor,
}) {

  const mission =
    runtime?.missionRuntime?.current;

  const projects =
    runtime?.projectRuntime?.items || [];

  const assets =
    runtime.assetRuntime?.items || [];

  const scenes =
    runtime.sceneRuntime?.items || [];

  const tasks =
    runtime.taskRuntime?.items || [];

  return (

    <div className="h-full min-h-0 overflow-auto p-8 text-white">

      {/* HEADER */}
      <div className="mb-8">

        <div className="text-xs uppercase tracking-[0.3em] text-[#c8a96a]">
          Mission Control
        </div>

        <h1 className="mt-2 text-3xl font-semibold">
          {mission?.business_goal || "No Mission Selected"}
        </h1>

        <p className="mt-2 text-white/50">
          {mission?.objective || "Define your creative direction"}
        </p>

      </div>

      {/* STATS GRID */}
      <div className="grid grid-cols-4 gap-4 mb-8">

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-xs text-white/50">Deliverables</div>
          <div className="text-2xl font-bold">{projects.length}</div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-xs text-white/50">Scenes</div>
          <div className="text-2xl font-bold">{scenes.length}</div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-xs text-white/50">Assets</div>
          <div className="text-2xl font-bold">{assets.length}</div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-xs text-white/50">Tasks</div>
          <div className="text-2xl font-bold">{tasks.length}</div>
        </div>

      </div>

      {/* MISSION DETAILS */}
      <div className="grid grid-cols-2 gap-6">

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <div className="text-sm text-white/50 mb-2">Business Goal</div>
          <div className="text-lg">
            {mission?.business_goal || "—"}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <div className="text-sm text-white/50 mb-2">Objective</div>
          <div className="text-lg">
            {mission?.objective || "—"}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <div className="text-sm text-white/50 mb-2">Budget</div>
          <div className="text-lg">
            {mission?.budget || 0} {mission?.currency}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <div className="text-sm text-white/50 mb-2">Status</div>
          <div className="text-lg">
            {mission?.status || "draft"}
          </div>
        </div>

      </div>

      {/* PROJECT LIST */}
      <div className="mt-10">

        <div className="text-sm uppercase tracking-[0.2em] text-white/40 mb-4">
          Deliverables
        </div>

        <div className="space-y-2">

          {projects.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-white/10 bg-white/[0.02] p-4 flex justify-between"
            >
              <div>
                <div className="font-medium">
                  {p.name || "Untitled Project"}
                </div>
                <div className="text-xs text-white/40">
                  {p.production_type}
                </div>
              </div>

              <div className="text-xs text-white/50">
                {p.status}
              </div>
            </div>
          ))}

        </div>

      </div>

    </div>

  );

}
