"use client";

import { useMemo } from "react";

export default function ProductionWorkspace({
  runtime,
}) {

  const storyboard =
    runtime?.storyboardRuntime?.storyboard || [];

  const mission =
    runtime?.missionRuntime?.mission;

  const tasks = useMemo(() => {

    if (!storyboard.length) return [];

    return storyboard.flatMap((scene) => {

      return scene.shots.map((shot) => ({

        id: `${scene.id}_${shot.id}`,

        scene: scene.title,

        type: shot.type,

        description: shot.description,

        status: "pending",

        assigned_to: "AI_PRODUCTION_ENGINE",

        priority:
          shot.type === "closeup" ? "high" : "normal",

      }));

    });

  }, [storyboard]);

  return (

    <div className="h-full overflow-auto p-8 text-white">

      {/* HEADER */}
      <div className="mb-8">

        <div className="text-xs uppercase tracking-[0.3em] text-cyan-300">
          Production Engine
        </div>

        <h1 className="mt-2 text-3xl font-semibold">
          Execution Pipeline
        </h1>

        <p className="mt-2 text-white/50">
          Converts storyboard into production tasks.
        </p>

      </div>

      {!tasks.length ? (
        <div className="text-white/40">
          No storyboard available. Build Storyboard first.
        </div>
      ) : (
        <div className="space-y-3">

          {tasks.map((task) => (

            <div
              key={task.id}
              className="p-4 rounded-xl border border-white/10 bg-white/[0.03]"
            >

              <div className="flex justify-between">

                <div>

                  <div className="text-sm font-semibold">
                    {task.scene}
                  </div>

                  <div className="text-white/50 text-sm mt-1">
                    {task.description}
                  </div>

                </div>

                <div className="text-right">

                  <div className="text-xs text-cyan-300 uppercase">
                    {task.type}
                  </div>

                  <div className="text-xs text-white/40 mt-1">
                    {task.priority}
                  </div>

                </div>

              </div>

            </div>

          ))}

        </div>
      )}

    </div>

  );

}
