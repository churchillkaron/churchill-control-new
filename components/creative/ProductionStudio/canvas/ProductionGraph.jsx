"use client";

import { useMemo, useState } from "react";

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[10px] uppercase tracking-[0.22em] text-white/40">
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold">
        {value}
      </div>
    </div>
  );
}

function Shot({
  shot,
  selected,
  onSelect,
}) {
  return (
    <button
      type="button"
      onClick={() =>
        onSelect({
          type: "shot",
          data: shot,
        })
      }
      className={[
        "ml-8 w-full rounded-xl border p-4 text-left transition",
        selected?.data?.id === shot.id
          ? "border-[#c8a96a]/40 bg-[#c8a96a]/10"
          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">

        <div>

          <div className="text-xs uppercase tracking-[0.22em] text-white/40">
            Shot {shot.shot_number}
          </div>

          <div className="mt-2 font-medium">
            {shot.title || "Untitled Shot"}
          </div>

        </div>

        <div className="rounded-full bg-white/10 px-3 py-1 text-xs">
          {shot.status || "Planning"}
        </div>

      </div>
    </button>
  );
}

function Scene({
  scene,
  shots,
  selected,
  onSelect,
}) {

  const [open,setOpen] =
    useState(true);

  return (

    <div className="rounded-2xl border border-[#c8a96a]/20 bg-[#c8a96a]/[0.05]">

      <div className="flex items-center">

        <button
          className="px-5 text-[#c8a96a]"
          onClick={() => setOpen(!open)}
        >
          {open ? "−" : "+"}
        </button>

        <button
          className={[
            "flex-1 p-5 text-left",
            selected?.data?.id === scene.id
              ? "bg-[#c8a96a]/10"
              : ""
          ].join(" ")}
          onClick={() =>
            onSelect({
              type:"scene",
              data:scene,
            })
          }
        >

          <div className="text-xs uppercase tracking-[0.24em] text-[#c8a96a]">
            Scene {scene.scene_number}
          </div>

          <div className="mt-2 text-2xl font-semibold">
            {scene.title || "Untitled Scene"}
          </div>

        </button>

      </div>

      {open && (

        <div className="space-y-3 border-t border-white/10 p-5">

          {shots.map(shot => (

            <Shot
              key={shot.id}
              shot={shot}
              selected={selected}
              onSelect={onSelect}
            />

          ))}

        </div>

      )}

    </div>

  );

}

export default function ProductionGraph({
  runtime,
  editor,
}) {

  const selected =
    editor.selection;

const setSelected =
    editor.setSelection;

  const scenes =
    runtime.sceneRuntime?.items || [];

  const shots =
    runtime.shotRuntime?.items || [];

  const tasks =
    runtime.taskRuntime?.items || [];

  const assets =
    runtime.assetRuntime?.items || [];

  const queue =
    runtime.queueRuntime || {};

  const grouped =
    useMemo(() => {

      const m = {};

      shots.forEach(shot => {

        if(!m[shot.scene_id])
          m[shot.scene_id]=[];

        m[shot.scene_id].push(shot);

      });

      return m;

    },[shots]);

  return (

    <div className="space-y-6">

      <div className="rounded-2xl border border-[#c8a96a]/20 bg-[#c8a96a]/[0.05] p-4">

        <div className="flex flex-wrap gap-4">



        <Stat
          label="Scenes"
          value={scenes.length}
        />

        <Stat
          label="Shots"
          value={shots.length}
        />

        <Stat
          label="Tasks"
          value={tasks.length}
        />

        <Stat
          label="Assets"
          value={assets.length}
        />

        <Stat
          label="Queue"
          value={queue.total || 0}
        />



        </div>

      </div>

      <div>


        <div className="space-y-5">

          {scenes.map(scene => (

            <Scene
              key={scene.id}
              scene={scene}
              shots={grouped[scene.id] || []}
              selected={selected}
              onSelect={setSelected}
            />

          ))}

        </div>

      </div>

    </div>

  );

}
