"use client";

import { useEffect, useState } from "react";

const STAGES = [
  "BRIEF",
  "RESEARCH",
  "STRATEGY",
  "STORYBOARD",
  "GRAPH",
  "EXECUTION",
  "PRODUCTION",
  "COMPLETE",
];

export default function PipelineStatusCard({
  organizationId,
  projectId,
}) {

  const [state,setState] =
    useState(null);

  useEffect(() => {

    if (
      !organizationId ||
      !projectId
    ) {
      return;
    }

    load();

    const timer =
      setInterval(
        load,
        3000,
      );

    return () =>
      clearInterval(
        timer,
      );

    async function load() {

      const res =
        await fetch(

          `/api/creative/state?organization_id=${organizationId}&creative_project_id=${projectId}`,

          {

            cache:
              "no-store",

          },

        );

      if (!res.ok)
        return;

      const json =
        await res.json();

      setState(
        json.state ||
        null,
      );

    }

  }, [

    organizationId,

    projectId,

  ]);

  return (

    <div className="rounded-xl border border-white/10 bg-black/20 p-4">

      <div className="mb-3 text-sm font-semibold">

        Pipeline Status

      </div>

      <div className="space-y-2">

        {STAGES.map(stage => {

          const active =
            state?.stage ===
            stage;

          const done =
            STAGES.indexOf(stage) <
            STAGES.indexOf(
              state?.stage,
            );

          return (

            <div
              key={stage}
              className="flex items-center justify-between text-sm"
            >

              <span>

                {stage}

              </span>

              <span>

                {active
                  ? "▶"
                  : done
                  ? "✓"
                  : "○"}

              </span>

            </div>

          );

        })}

      </div>

    </div>

  );

}
