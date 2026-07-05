"use client";

import { useMemo } from "react";

export default function StrategyWorkspace({
  runtime,
}) {

  const mission =
    runtime?.missionRuntime?.mission;

  const brief =
    {
      objective: mission?.objective,
      business_goal: mission?.business_goal,
      budget: mission?.budget,
      audience: mission?.audience,
      channels: mission?.channels,
    };

  const strategy = useMemo(() => {

    if (!brief.business_goal) {
      return null;
    }

    return {
      positioning:
        `Focus on ${brief.business_goal} with high emotional clarity.`,

      audience_strategy:
        brief.audience
          ? `Target: ${brief.audience}`
          : "Define target audience",

      channel_strategy:
        brief.channels
          ? `Distribute via: ${brief.channels}`
          : "Define channels",

      production_direction:
        "Create high-impact visual storytelling with modular scenes",

      budget_logic:
        brief.budget > 0
          ? `Optimize within budget ${brief.budget}`
          : "No budget constraint defined",

      ai_director_notes:
        "Prioritize engagement, clarity, and conversion signals",
    };

  }, [brief]);

  return (

    <div className="h-full overflow-auto p-8 text-white">

      {/* HEADER */}
      <div className="mb-8">

        <div className="text-xs uppercase tracking-[0.3em] text-cyan-300">
          Strategy Engine
        </div>

        <h1 className="mt-2 text-3xl font-semibold">
          AI Production Strategy
        </h1>

        <p className="mt-2 text-white/50">
          Converts mission brief into execution logic.
        </p>

      </div>

      {!strategy ? (
        <div className="text-white/40">
          No brief defined yet. Fill Mission Brief first.
        </div>
      ) : (
        <div className="space-y-4">

          <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03]">
            <div className="text-xs text-white/40 mb-1">Positioning</div>
            <div>{strategy.positioning}</div>
          </div>

          <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03]">
            <div className="text-xs text-white/40 mb-1">Audience Strategy</div>
            <div>{strategy.audience_strategy}</div>
          </div>

          <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03]">
            <div className="text-xs text-white/40 mb-1">Channel Strategy</div>
            <div>{strategy.channel_strategy}</div>
          </div>

          <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03]">
            <div className="text-xs text-white/40 mb-1">Production Direction</div>
            <div>{strategy.production_direction}</div>
          </div>

          <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03]">
            <div className="text-xs text-white/40 mb-1">Budget Logic</div>
            <div>{strategy.budget_logic}</div>
          </div>

          <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03]">
            <div className="text-xs text-white/40 mb-1">AI Director Notes</div>
            <div>{strategy.ai_director_notes}</div>
          </div>

        </div>
      )}

    </div>

  );

}
