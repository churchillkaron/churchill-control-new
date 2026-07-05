"use client";

import { useMemo } from "react";

export default function StoryboardWorkspace({
  runtime,
}) {

  const mission =
    runtime?.missionRuntime?.mission;

  const concepts =
    [
      "Emotional Hook Campaign",
      "Problem/Solution Narrative",
      "Hero Product Focus",
      "Fast Social Cut Strategy"
    ];

  const storyboard = useMemo(() => {

    if (!mission?.business_goal) return [];

    return concepts.map((concept, index) => {

      return {
        id: `scene_${index + 1}`,

        title: `${concept} - Scene ${index + 1}`,

        description:
          `Visual representation of: ${concept} based on ${mission.business_goal}`,

        shots: [
          {
            id: `shot_${index + 1}_1`,
            type: "wide",
            description: "Establish environment and tone"
          },
          {
            id: `shot_${index + 1}_2`,
            type: "medium",
            description: "Focus on subject interaction"
          },
          {
            id: `shot_${index + 1}_3`,
            type: "closeup",
            description: "Emotional detail / product focus"
          }
        ]
      };

    });

  }, [mission]);

  return (

    <div className="h-full overflow-auto p-8 text-white">

      {/* HEADER */}
      <div className="mb-8">

        <div className="text-xs uppercase tracking-[0.3em] text-cyan-300">
          Storyboard Engine
        </div>

        <h1 className="mt-2 text-3xl font-semibold">
          Scene Planning
        </h1>

        <p className="mt-2 text-white/50">
          Converts concepts into structured visual scenes.
        </p>

      </div>

      {!storyboard.length ? (
        <div className="text-white/40">
          No mission or concept available yet.
        </div>
      ) : (
        <div className="space-y-6">

          {storyboard.map((scene) => (

            <div
              key={scene.id}
              className="p-5 rounded-xl border border-white/10 bg-white/[0.03]"
            >

              <div className="text-sm font-semibold text-white">
                {scene.title}
              </div>

              <div className="text-white/50 mt-2">
                {scene.description}
              </div>

              <div className="mt-4 space-y-2">

                {scene.shots.map((shot) => (
                  <div
                    key={shot.id}
                    className="p-3 rounded-lg bg-white/5 border border-white/10"
                  >
                    <div className="text-xs text-cyan-300 uppercase">
                      {shot.type}
                    </div>
                    <div className="text-sm text-white/70">
                      {shot.description}
                    </div>
                  </div>
                ))}

              </div>

            </div>

          ))}

        </div>
      )}

    </div>

  );

}
