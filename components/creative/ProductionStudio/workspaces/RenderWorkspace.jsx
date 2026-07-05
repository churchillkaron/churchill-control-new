"use client";

import { useMemo } from "react";

export default function RenderWorkspace({
  runtime,
}) {

  const tasks =
    runtime.data.tasks || [];

  const assets =
    runtime.data.assets || [];

  const renderJobs = useMemo(() => {

    if (!tasks.length) return [];

    return tasks.map((task) => ({

      id: task.id,

      type: task.type,

      description: task.description,

      provider: "auto",

      status: task.status || "pending",

      priority: task.priority || "normal",

      capability:
        task.type === "closeup"
          ? "GENERATE_IMAGE"
          : "GENERATE_VIDEO",

    }));

  }, [tasks]);

  return (

    <div className="h-full overflow-auto p-8 text-white">

      {/* HEADER */}
      <div className="mb-8">

        <div className="text-xs uppercase tracking-[0.3em] text-cyan-300">
          Render Engine
        </div>

        <h1 className="mt-2 text-3xl font-semibold">
          Production Rendering
        </h1>

        <p className="mt-2 text-white/50">
          Converts production tasks into provider jobs.
        </p>

      </div>

      {!renderJobs.length ? (
        <div className="text-white/40">
          No production tasks available.
        </div>
      ) : (
        <div className="space-y-3">

          {renderJobs.map((job) => (

            <div
              key={job.id}
              className="p-4 rounded-xl border border-white/10 bg-white/[0.03]"
            >

              <div className="flex justify-between">

                <div>

                  <div className="text-sm font-semibold">
                    {job.description}
                  </div>

                  <div className="text-white/40 text-xs mt-1">
                    Capability: {job.capability}
                  </div>

                </div>

                <div className="text-right">

                  <div className="text-xs text-cyan-300 uppercase">
                    {job.status}
                  </div>

                  <div className="text-xs text-white/40 mt-1">
                    {job.provider}
                  </div>

                </div>

              </div>

            </div>

          ))}

        </div>
      )}

      {/* ASSETS */}
      <div className="mt-10">

        <div className="text-sm uppercase tracking-[0.2em] text-white/40 mb-3">
          Generated Assets
        </div>

        <div className="space-y-2">

          {assets.map((asset) => (

            <div
              key={asset.id}
              className="p-3 rounded-lg border border-white/10 bg-white/[0.02]"
            >

              <div className="text-sm">
                {asset.title || "Untitled Asset"}
              </div>

              <div className="text-xs text-white/40">
                {asset.type}
              </div>

            </div>

          ))}

        </div>

      </div>

    </div>

  );

}
