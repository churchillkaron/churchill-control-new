"use client";

import { useMemo } from "react";

export default function ConceptWorkspace({
  runtime,
}) {

  const mission =
    runtime?.missionRuntime?.mission;

  const strategy = {
    business_goal: mission?.business_goal,
    objective: mission?.objective,
    audience: mission?.audience,
    channels: mission?.channels,
  };

  const concepts = useMemo(() => {

    if (!strategy.business_goal) return [];

    return [
      {
        id: "concept_1",
        title: "Emotional Hook Campaign",
        description:
          `Focus on emotional storytelling around: ${strategy.business_goal}`,
      },
      {
        id: "concept_2",
        title: "Problem/Solution Narrative",
        description:
          `Show clear transformation driven by: ${strategy.objective}`,
      },
      {
        id: "concept_3",
        title: "Hero Product / Brand Focus",
        description:
          `Highlight brand value for audience: ${strategy.audience || "general audience"}`,
      },
      {
        id: "concept_4",
        title: "Fast Social Cut Strategy",
        description:
          `Optimized for channels: ${strategy.channels || "multi-platform distribution"}`,
      },
    ];

  }, [strategy]);

  return (

    <div className="h-full overflow-auto p-8 text-white">

      {/* HEADER */}
      <div className="mb-8">

        <div className="text-xs uppercase tracking-[0.3em] text-cyan-300">
          Concept Engine
        </div>

        <h1 className="mt-2 text-3xl font-semibold">
          Creative Concepts
        </h1>

        <p className="mt-2 text-white/50">
          AI-generated creative directions based on strategy.
        </p>

      </div>

      {!concepts.length ? (
        <div className="text-white/40">
          No strategy available yet. Build Strategy first.
        </div>
      ) : (
        <div className="space-y-4">

          {concepts.map((c) => (
            <div
              key={c.id}
              className="p-5 rounded-xl border border-white/10 bg-white/[0.03]"
            >
              <div className="text-sm font-semibold text-white">
                {c.title}
              </div>

              <div className="text-white/50 mt-2">
                {c.description}
              </div>
            </div>
          ))}

        </div>
      )}

    </div>

  );

}
