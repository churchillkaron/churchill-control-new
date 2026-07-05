"use client";

import { useMemo, useState } from "react";

export default function StudioMain({ runtime }) {

  const data = runtime?.data || {};

  const [activeStage, setActiveStage] = useState("production");

  const stages = [
    "brief",
    "strategy",
    "storyboard",
    "production",
    "render",
    "publish"
  ];

  const assets = data.assets || [];
  const scenes = data.scenes || [];
  const shots = data.shots || [];
  const tasks = data.tasks || [];

  return (
    <div className="h-screen w-full bg-black text-white flex flex-col">

      {/* PROJECT HEADER */}
      <div className="p-4 border-b border-white/10 flex justify-between">
        <div>
          <div className="text-sm opacity-60">Creative Studio</div>
          <div className="text-lg font-semibold">
            {runtime?.projectRuntime?.project?.name || "No Project Selected"}
          </div>
        </div>
      </div>

      {/* PIPELINE NAV */}
      <div className="flex gap-3 p-3 border-b border-white/10 overflow-x-auto">
        {stages.map(stage => (
          <button
            key={stage}
            onClick={() => setActiveStage(stage)}
            className={`px-3 py-1 rounded ${
              activeStage === stage
                ? "bg-white text-black"
                : "bg-white/10"
            }`}
          >
            {stage.toUpperCase()}
          </button>
        ))}
      </div>

      {/* MAIN AREA */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT - PIPELINE CONTENT */}
        <div className="flex-1 p-4 overflow-auto">

          {activeStage === "production" && (
            <div className="grid grid-cols-3 gap-4">

              <div className="border border-white/10 p-3 rounded">
                <h3 className="mb-2">Scenes</h3>
                <pre className="text-xs opacity-70">
                  {JSON.stringify(scenes, null, 2)}
                </pre>
              </div>

              <div className="border border-white/10 p-3 rounded">
                <h3 className="mb-2">Shots</h3>
                <pre className="text-xs opacity-70">
                  {JSON.stringify(shots, null, 2)}
                </pre>
              </div>

              <div className="border border-white/10 p-3 rounded">
                <h3 className="mb-2">Tasks</h3>
                <pre className="text-xs opacity-70">
                  {JSON.stringify(tasks, null, 2)}
                </pre>
              </div>

            </div>
          )}

          {activeStage !== "production" && (
            <div className="opacity-60">
              No data mapped for: {activeStage}
            </div>
          )}

        </div>

        {/* RIGHT - ASSETS */}
        <div className="w-80 border-l border-white/10 p-3 overflow-auto">
          <h3 className="mb-3">Assets</h3>

          {assets.map(a => (
            <div key={a.id} className="p-2 border border-white/10 rounded mb-2">
              <div className="text-sm">{a.name}</div>
            </div>
          ))}
        </div>

      </div>

    </div>
  );
}
