"use client";

import { useEffect, useState }
from "react";

import PosterPreview
from "../PosterPreview";

export default function
StudioCenterStage({

  poster,

  exportRef,

  selectedAssets = [],

  setSelectedAssets,

  latestCampaign,

}) {

  const [activeAsset,
  setActiveAsset] =
    useState(null);

  useEffect(() => {

    if (
      latestCampaign?.video_url
    ) {

      setActiveAsset({

        type: "video",

        url:
          latestCampaign.video_url,

      });

      return;

    }

    const imageUrl =

      latestCampaign?.image_url ||

      latestCampaign?.imageUrl ||

      latestCampaign?.thumbnail_url ||

      null;

    if (imageUrl) {

      setActiveAsset({

        type: "image",

        url: imageUrl,

      });

    }

  }, [latestCampaign]);

  useEffect(() => {

    if (

      !latestCampaign?.video_job_id ||

      latestCampaign?.video_url

    ) return;

    const interval =

      setInterval(async () => {

        try {

          const response =

            await fetch(

              "/api/marketing/check-video-status",

              {

                method: "POST",

                headers: {

                  "Content-Type":
                    "application/json",

                },

                body: JSON.stringify({

                  campaignId:
                    latestCampaign.id,

                  videoJobId:
                    latestCampaign.video_job_id,

                }),

              }

            );

          const result =
            await response.json();

          console.log(
            "VIDEO POLL RESULT:",
            result
          );

          if (
            result?.completed
          ) {

            clearInterval(
              interval
            );

            window.location.reload();

          }

        } catch (err) {

          console.error(err);

        }

      }, 10000);

    return () =>
      clearInterval(interval);

  }, [

    latestCampaign?.video_job_id,

    latestCampaign?.video_url,

  ]);

  const campaignTags =

    (
      latestCampaign?.selected_assets ||

      selectedAssets ||

      []
    )

      .flatMap(

        (asset) =>
          asset?.tags || []

      )

      .filter(Boolean)

      .slice(0, 12);

  return (

    <div
      className="
        relative
        h-full
        overflow-y-auto
        px-[420px]
        py-12
      "
    >

      <div
        className="
          absolute
          inset-0
          bg-[radial-gradient(circle_at_center,rgba(249,115,22,0.08),transparent_60%)]
          pointer-events-none
        "
      />

      <div
        className="
          relative
          z-10
          w-full
          max-w-[780px]
          mx-auto
          flex
          flex-col
          gap-6
          pb-28
        "
      >

        <div
          className="
            flex
            items-center
            justify-center
            gap-3
            mb-2
          "
        >

          <div
            className="
              bg-black/60
              border
              border-orange-500/20
              px-5
              py-3
              rounded-full
              text-xs
              uppercase
              tracking-[0.3em]
              text-orange-400
              backdrop-blur-xl
            "
          >
            Live Campaign
          </div>

          <div
            className="
              bg-green-500/20
              border
              border-green-500/20
              px-5
              py-3
              rounded-full
              text-xs
              uppercase
              tracking-[0.3em]
              text-green-400
              backdrop-blur-xl
            "
          >
            AI Render
          </div>

        </div>

        {activeAsset ? (

          <>

            <div
              className="
                relative
                w-full
                aspect-[4/5]
                rounded-[34px]
                overflow-hidden
                border
                border-orange-500/20
                shadow-[0_0_80px_rgba(249,115,22,0.12)]
                bg-black
              "
            >

              {

activeAsset?.type ===
              "video"

              ? (

                <video

                  src={
                    activeAsset.url
                  }

                  controls

                  autoPlay

                  loop

                  muted

                  playsInline

                  className="
                    absolute
                    inset-0
                    w-full
                    h-full
                    object-cover
                  "
                />

              ) : (

                <img

                  src={
                    activeAsset.url
                  }

                  alt="Campaign"

                  className="
                    absolute
                    inset-0
                    w-full
                    h-full
                    object-cover
                  "
                />

              )}

            </div>

            <div
              className="
                w-full
                bg-black/55
                border
                border-white/10
                rounded-[28px]
                p-7
                backdrop-blur-xl
              "
            >

              <div
                className="
                  text-orange-400
                  uppercase
                  tracking-[0.3em]
                  text-xs
                  mb-5
                "
              >
                AI Campaign Copy
              </div>

              <div
                className="
                  text-white/80
                  leading-8
                  text-[15px]
                  whitespace-pre-wrap
                  mb-7
                "
              >
                {

latestCampaign?.content ||

                  "No campaign copy generated yet."

                }
              </div>

              <div
                className="
                  flex
                  flex-wrap
                  gap-2
                "
              >

                {campaignTags.map(

                  (tag, index) => (

                    <div

                      key={`${tag}-${index}`}

                      className="
                        px-3
                        py-1.5
                        rounded-full
                        bg-orange-500/10
                        border
                        border-orange-500/20
                        text-orange-300
                        text-xs
                      "
                    >
                      #{tag}
                    </div>

                  )

                )}

              </div>

            </div>

          </>

        ) : (

          <PosterPreview
            poster={poster}
            exportRef={exportRef}
          />

        )}

      </div>

      {

selectedAssets.length > 0 && (

        <div
          className="
            fixed
            bottom-8
            left-1/2
            -translate-x-1/2
            flex
            gap-3
            overflow-x-auto
            z-40
            bg-black/60
            backdrop-blur-xl
            border
            border-white/10
            rounded-2xl
            p-4
            max-w-[620px]
          "
        >

          {selectedAssets.map(
            (asset) => {

              const mediaUrl =

                asset?.video_url ||

                asset?.file_url ||

                asset?.image_url ||

                asset?.thumbnail_url;

              const isVideo =

                asset?.tags?.includes(
                  "video"
                );

              return (

                <div
                  key={asset.id}
                  className="
                    relative
                    shrink-0
                    cursor-pointer
                  "
                  onClick={() =>

                    setActiveAsset({

                      type:
                        isVideo
                          ? "video"
                          : "image",

                      url: mediaUrl,

                    })

                  }
                >

                  {

isVideo ? (

                    <video
                      src={mediaUrl}
                      className="
                        w-20
                        h-20
                        object-cover
                        rounded-xl
                        border
                        border-orange-500/30
                      "
                    />

                  ) : (

                    <img
                      src={mediaUrl}
                      alt={
                        asset.name ||
                        "Asset"
                      }
                      className="
                        w-20
                        h-20
                        object-cover
                        rounded-xl
                        border
                        border-orange-500/30
                      "
                    />

                  )}

                  <button
                    onClick={(e) => {

                      e.stopPropagation();

                      if (
                        setSelectedAssets
                      ) {

                        setSelectedAssets(
                          (prev) =>

                            prev.filter(
                              (a) =>
                                a.id !==
                                asset.id
                            )
                        );

                      }

                    }}
                    className="
                      absolute
                      -top-2
                      -right-2
                      w-6
                      h-6
                      rounded-full
                      bg-red-500
                      text-white
                      text-xs
                      flex
                      items-center
                      justify-center
                    "
                  >
                    ×
                  </button>

                </div>

              );

            }

          )}

        </div>

      )}

    </div>

  );

}