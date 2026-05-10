"use client";

import QueuePanel
from "./QueuePanel";

export default function StudioRightPanel({

  latestCampaign,

  queuedCampaigns,

  setQueuedCampaigns,

}) {

  return (

    <div
      className="
        bg-white/5
        border
        border-white/10
        rounded-2xl
        p-5
      "
    >

      <div
        className="
          text-orange-500
          uppercase
          tracking-[0.2em]
          text-xs
          mb-5
        "
      >
        Campaign Monitor
      </div>

      {latestCampaign ? (

        <div
          className="
            bg-black/30
            rounded-2xl
            p-5
            mb-5
            border
            border-white/10
          "
        >

          <div
            className="
              text-orange-400
              uppercase
              text-xs
              tracking-[0.2em]
              mb-4
            "
          >
            Latest Campaign
          </div>

          <div className="space-y-3 text-sm">

            <div>
              <div className="text-white/40">
                Campaign ID
              </div>

              <div className="text-white break-all">
                {latestCampaign.id}
              </div>
            </div>

            <div>
              <div className="text-white/40">
                Type
              </div>

              <div className="text-white">
                {latestCampaign.campaign_type}
              </div>
            </div>

            <div>
              <div className="text-white/40">
                Engine
              </div>

              <div className="text-green-400">
                {latestCampaign.engine}
              </div>
            </div>

            <div>
              <div className="text-white/40">
                Provider
              </div>

              <div className="text-blue-400">
                {latestCampaign.provider}
              </div>
            </div>

            <div>
              <div className="text-white/40">
                Status
              </div>

              <div className="text-yellow-400">
            <span
  className={`

    ${latestCampaign.status === "published"
      ? "text-green-400"
      : ""}

    ${latestCampaign.status === "publishing"
      ? "text-yellow-400"
      : ""}

    ${latestCampaign.status === "queued"
      ? "text-blue-400"
      : ""}

    ${latestCampaign.status === "failed"
      ? "text-red-400"
      : ""}

    ${latestCampaign.status === "processing"
      ? "text-orange-400"
      : ""}

    ${latestCampaign.status === "ready"
      ? "text-cyan-400"
      : ""}

  `}
>
  {latestCampaign.status}
</span>
              </div>
            </div>

          </div>

        </div>

      ) : (

        <div
          className="
            bg-black/30
            rounded-2xl
            p-5
            mb-5
            text-white/50
            text-sm
            border
            border-white/10
          "
        >
          No campaign generated yet.
        </div>

      )}

      <QueuePanel
        queuedCampaigns={
          queuedCampaigns
        }
        setQueuedCampaigns={
          setQueuedCampaigns
        }
      />

      <div
        className="
          border-t
          border-white/10
          mt-6
          pt-6
        "
      >

        <div
          className="
            text-orange-500
            uppercase
            tracking-[0.2em]
            text-xs
            mb-5
          "
        >
          AI Insights
        </div>

        <div className="space-y-4">

          <div
            className="
              bg-black/30
              border
              border-white/10
              rounded-2xl
              p-5
            "
          >

            <div
              className="
                text-white/40
                text-sm
                mb-2
              "
            >
              Best Mood
            </div>

            <div className="text-xl">
              Luxury Nightlife
            </div>

          </div>

          <div
            className="
              bg-black/30
              border
              border-white/10
              rounded-2xl
              p-5
            "
          >

            <div
              className="
                text-white/40
                text-sm
                mb-2
              "
            >
              Best Lighting
            </div>

            <div className="text-xl">
              Cinematic Warm
            </div>

          </div>

          <div
            className="
              bg-black/30
              border
              border-white/10
              rounded-2xl
              p-5
            "
          >

            <div
              className="
                text-white/40
                text-sm
                mb-2
              "
            >
              AI Recommendation
            </div>

            <div
              className="
                text-white/80
                leading-7
                text-sm
              "
            >
              Luxury campaigns published between 7PM–10PM generated the strongest engagement.
            </div>

          </div>

        </div>

      </div>

    </div>

  );

}