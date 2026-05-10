"use client";

import QueuePanel
from "./QueuePanel";

export default function StudioRightPanel({

  latestCampaign,

  queuedCampaigns,

  setQueuedCampaigns,

  recommendation,

  promptPreview,

  promptHistory,

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

        <>

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

                <div>

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

          {latestCampaign?.dna && (

            <div
              className="
                mt-5
                bg-black/40
                border
                border-white/10
                rounded-2xl
                p-4
                mb-5
              "
            >

              <div
                className="
                  text-orange-400
                  uppercase
                  text-[10px]
                  tracking-[0.2em]
                  mb-3
                "
              >
                Campaign DNA
              </div>

              <div className="space-y-2 text-xs">

                <div>

                  <span className="text-white/40">
                    Mood:
                  </span>

                  <span className="ml-2 text-white">
                    {
                      latestCampaign
                        ?.dna?.mood
                    }
                  </span>

                </div>

                <div>

                  <span className="text-white/40">
                    Lighting:
                  </span>

                  <span className="ml-2 text-white">
                    {
                      latestCampaign
                        ?.dna?.lighting
                    }
                  </span>

                </div>

                <div>

                  <span className="text-white/40">
                    Scene:
                  </span>

                  <span className="ml-2 text-white">
                    {
                      latestCampaign
                        ?.dna?.sceneType
                    }
                  </span>

                </div>

              </div>

            </div>

          )}

        </>

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

      {latestCampaign?.selected_assets
        ?.length > 0 && (

        <div className="mt-5">

          <div
            className="
              text-orange-400
              uppercase
              text-[10px]
              tracking-[0.2em]
              mb-3
            "
          >
            AI Selected Assets
          </div>

          <div
            className="
              grid
              grid-cols-2
              gap-2
            "
          >

            {latestCampaign
              .selected_assets
              .slice(0, 4)
              .map((asset) => (

                <img
                  key={asset.id}
                  src={
                    asset.image_url
                  }
                  alt={asset.name}
                  className="
                    w-full
                    h-24
                    object-cover
                    rounded-xl
                    border
                    border-white/10
                  "
                />

            ))}

          </div>

        </div>

      )}

      <div
        className="
          bg-black/30
          border
          border-white/10
          rounded-2xl
          p-5
          mb-5
          mt-5
        "
      >

        <div
          className="
            text-orange-400
            uppercase
            text-[10px]
            tracking-[0.2em]
            mb-4
          "
        >
          AI Recommendation
        </div>

        <div className="space-y-2 text-sm">

          <div>

            <div className="text-white/40">
              Mood
            </div>

            <div className="text-white">
              {
                recommendation?.mood
              }
            </div>

          </div>

          <div>

            <div className="text-white/40">
              Scene
            </div>

            <div className="text-white">
              {
                recommendation?.sceneType
              }
            </div>

          </div>

          <div>

            <div className="text-white/40">
              Lighting
            </div>

            <div className="text-white">
              {
                recommendation?.lighting
              }
            </div>

          </div>

        </div>

      </div>

      <div
        className="
          bg-black/30
          border
          border-white/10
          rounded-2xl
          p-5
          mb-5
        "
      >

        <div
          className="
            text-orange-400
            uppercase
            text-[10px]
            tracking-[0.2em]
            mb-4
          "
        >
          AI Prompt Preview
        </div>

        <div
          className="
            text-white/70
            text-xs
            leading-6
            max-h-[220px]
            overflow-y-auto
            whitespace-pre-wrap
          "
        >
          {promptPreview}
        </div>

      </div>

      <div
        className="
          bg-black/30
          border
          border-white/10
          rounded-2xl
          p-5
          mb-5
        "
      >

        <div
          className="
            text-orange-400
            uppercase
            text-[10px]
            tracking-[0.2em]
            mb-4
          "
        >
          AI Memory
        </div>

        <div className="space-y-3">

          {(promptHistory || [])
            .slice(0, 3)
            .map((memory) => (

              <div
                key={memory.id}
                className="
                  bg-black/40
                  border
                  border-white/10
                  rounded-xl
                  p-3
                "
              >

                <div
                  className="
                    text-white/50
                    text-[10px]
                    mb-2
                  "
                >
                  {
                    memory
                      ?.recommendation
                      ?.campaignType
                  }
                </div>

                <div
                  className="
                    text-white/80
                    text-xs
                    line-clamp-4
                  "
                >
                  {memory.prompt}
                </div>

              </div>

          ))}

        </div>

      </div>

      <QueuePanel
        queuedCampaigns={
          queuedCampaigns
        }
        setQueuedCampaigns={
          setQueuedCampaigns
        }
      />

    </div>

  );

}