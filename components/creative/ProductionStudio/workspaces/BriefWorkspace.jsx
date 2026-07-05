"use client";

import { useState } from "react";

export default function BriefWorkspace({
  runtime,
  editor,
}) {

  const mission =
    runtime?.missionRuntime?.mission;

  const [form, setForm] = useState({
    objective: mission?.objective || "",
    business_goal: mission?.business_goal || "",
    audience: "",
    channels: "",
    budget: mission?.budget || 0,
  });

  return (

    <div className="h-full overflow-auto p-8 text-white">

      {/* HEADER */}
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[0.3em] text-cyan-300">
          Creative Brief
        </div>

        <h1 className="mt-2 text-3xl font-semibold">
          Define Mission Direction
        </h1>

        <p className="mt-2 text-white/50">
          This brief drives strategy, production and AI decisions.
        </p>
      </div>

      {/* FORM */}
      <div className="grid grid-cols-2 gap-6">

        <div>
          <label className="text-xs text-white/40">Business Goal</label>
          <textarea
            className="w-full mt-2 p-3 rounded-lg bg-white/5 border border-white/10"
            value={form.business_goal}
            onChange={(e) =>
              setForm({ ...form, business_goal: e.target.value })
            }
          />
        </div>

        <div>
          <label className="text-xs text-white/40">Objective</label>
          <textarea
            className="w-full mt-2 p-3 rounded-lg bg-white/5 border border-white/10"
            value={form.objective}
            onChange={(e) =>
              setForm({ ...form, objective: e.target.value })
            }
          />
        </div>

        <div>
          <label className="text-xs text-white/40">Target Audience</label>
          <input
            className="w-full mt-2 p-3 rounded-lg bg-white/5 border border-white/10"
            value={form.audience}
            onChange={(e) =>
              setForm({ ...form, audience: e.target.value })
            }
          />
        </div>

        <div>
          <label className="text-xs text-white/40">Channels</label>
          <input
            className="w-full mt-2 p-3 rounded-lg bg-white/5 border border-white/10"
            value={form.channels}
            onChange={(e) =>
              setForm({ ...form, channels: e.target.value })
            }
          />
        </div>

      </div>

      {/* PREVIEW */}
      <div className="mt-10 p-5 rounded-xl border border-white/10 bg-white/[0.03]">
        <div className="text-sm text-white/50 mb-3">
          Live Mission Preview
        </div>

        <div className="space-y-2">
          <div><b>Goal:</b> {form.business_goal}</div>
          <div><b>Objective:</b> {form.objective}</div>
          <div><b>Audience:</b> {form.audience}</div>
          <div><b>Channels:</b> {form.channels}</div>
          <div><b>Budget:</b> {form.budget}</div>
        </div>
      </div>

    </div>

  );
}
