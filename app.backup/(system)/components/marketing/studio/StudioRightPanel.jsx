"use client";

import QueuePanel
from "./QueuePanel";

export default function
StudioRightPanel({

  latestCampaign,

  queuedCampaigns,

  setQueuedCampaigns,

  recommendation,

  promptPreview,

  promptHistory,

  generateCampaign,

  setActiveAsset,

}) {

  const openAsset = (
    asset
  ) => {

    if (
      !setActiveAsset
    ) return;

    const mediaUrl =

      asset?.video_url ||

      asset?.file_url ||

      asset?.image_url ||

      asset?.thumbnail_url ||

      latestCampaign?.video_url ||

      latestCampaign?.image_url ||

      null;

    const isVideo =

      asset?.is_video ||

      asset?.tags?.includes(
        "video"
      ) ||

      asset?.video_url ||

      latestCampaign?.is_video;

    setActiveAsset({

      type:
        isVideo
          ? "video"
          : "image",

      url:
        mediaUrl,

      asset,

    });

  };

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
            onClick={() =>
              openAsset(
                latestCampaign
              )
            }
            className="
              bg-black/30
              rounded-2xl
              p-5
              mb-5
              border
              border-white/10
              cursor-pointer
              hover:border-orange-500/30
              transition-all
            "
          >

            {(

              latestCampaign?.video_url ||

              latestCampaign?.image_url ||

              latestCampaign?.thumbnail_url

            ) && (

              <div
                className="
                  relative
                  w-full
                  h-48
                  rounded-2xl
                  overflow-hidden
                  mb-4
                  bg-black
                "
              >

                {latestCampaign?.is_video ? (

                  <video
                    src={
                      latestCampaign.video_url
                    }
                    className="
                      w-full
                      h-full
                      object-cover
                    "
                  />

                ) : (

                  <img
                    src={

                      latestCampaign?.image_url ||

                      latestCampaign?.thumbnail_url

                    }
                    alt="Campaign"
                    className="
                      w-full
                      h-full
                      object-cover
                    "
                  />

                )}

              </div>

            )}

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

            <div
              className="
                text-white
                text-lg
                mb-3
              "
            >
              {latestCampaign.title}
            </div>

            <div className="space-y-3 text-sm">

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
                  .map((asset) => {

                    const mediaUrl =

                      asset?.video_url ||

                      asset?.file_url ||

                      asset?.image_url ||

                      asset?.thumbnail_url;

                    const isVideo =

                      asset?.is_video ||

                      asset?.tags?.includes(
                        "video"
                      );

                    return (

                      <div
                        key={asset.id}
                        onClick={() =>
                          openAsset(asset)
                        }
                        className="
                          relative
                          cursor-pointer
                          rounded-xl
                          overflow-hidden
                          border
                          border-white/10
                          hover:border-orange-500/40
                          transition-all
                        "
                      >

                        {isVideo ? (

                          <video
                            src={mediaUrl}
                            className="
                              w-full
                              h-24
                              object-cover
                            "
                          />

                        ) : (

                          <img
                            src={mediaUrl}
                            alt={asset.name}
                            className="
                              w-full
                              h-24
                              object-cover
                            "
                          />

                        )}

                      </div>

                    );

                  })}

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

      <QueuePanel
        queuedCampaigns={
          queuedCampaigns
        }
        setQueuedCampaigns={
          setQueuedCampaigns
        }
        setActiveAsset={
          setActiveAsset
        }
      />

    </div>

  );

}