"use client";

import ControlPanel
from "../ControlPanel";

import { uploadMarketingAsset }
from "@/lib/supabase/uploadMarketingAsset";

import { analyzeMarketingAsset }
from "@/lib/ai/analyzeMarketingAsset";

export default function StudioLeftPanel({

  poster,

  metaAccounts = [],

}) {

  const tenantId =
    "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

  return (

    <div
      className="
        absolute
        left-8
        top-8
        bottom-8
        w-[320px]
        bg-white/[0.03]
        backdrop-blur-2xl
        rounded-[32px]
        p-6
        overflow-auto
        z-20
      "
    >

      {/* HEADER */}

      <div
        className="
          text-orange-500
          uppercase
          tracking-[0.3em]
          text-xs
          mb-6
        "
      >
        Creative Direction
      </div>

      {/* EVENT SETTINGS */}

      <div
        className="
          bg-white/5
          border
          border-white/10
          rounded-2xl
          p-5
          mb-6
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
          Event Settings
        </div>

        <div className="space-y-4">

          <div>

            <div
              className="
                text-white/50
                text-xs
                uppercase
                tracking-[0.2em]
                mb-2
              "
            >
              Event Date
            </div>

            <input
              type="text"
              value={
                poster.eventDate || ""
              }
              onChange={(e) =>
                poster.setEventDate(
                  e.target.value
                )
              }
              placeholder="Friday"
              className="
                w-full
                bg-black/40
                border
                border-white/10
                rounded-xl
                p-4
                text-white
              "
            />

          </div>

          <div>

            <div
              className="
                text-white/50
                text-xs
                uppercase
                tracking-[0.2em]
                mb-2
              "
            >
              Event Time
            </div>

            <input
              type="text"
              value={
                poster.eventTime || ""
              }
              onChange={(e) =>
                poster.setEventTime(
                  e.target.value
                )
              }
              placeholder="8PM"
              className="
                w-full
                bg-black/40
                border
                border-white/10
                rounded-xl
                p-4
                text-white
              "
            />

          </div>

          <div>

            <div
              className="
                text-white/50
                text-xs
                uppercase
                tracking-[0.2em]
                mb-2
              "
            >
              Schedule Date
            </div>

            <input
              type="date"
              value={
                poster.scheduledDate || ""
              }
              onChange={(e) =>
                poster.setScheduledDate(
                  e.target.value
                )
              }
              className="
                w-full
                bg-black/40
                border
                border-white/10
                rounded-xl
                p-4
                text-white
              "
            />

          </div>

          <div>

            <div
              className="
                text-white/50
                text-xs
                uppercase
                tracking-[0.2em]
                mb-2
              "
            >
              Schedule Time
            </div>

            <input
              type="time"
              value={
                poster.scheduledTime || ""
              }
              onChange={(e) =>
                poster.setScheduledTime(
                  e.target.value
                )
              }
              className="
                w-full
                bg-black/40
                border
                border-white/10
                rounded-xl
                p-4
                text-white
              "
            />

          </div>

          {/* META PAGE CARDS */}

          <div>

            <div
              className="
                text-white/50
                text-xs
                uppercase
                tracking-[0.2em]
                mb-3
              "
            >
              Publish Page
            </div>

            <div
              className="
                grid
                grid-cols-2
                gap-3
              "
            >

              {metaAccounts.map(
                (account) => {

                  const active =

                    poster.pageId ===
                    account.page_id;

                  return (

                    <button
                      key={account.id}
                      onClick={() =>
                        poster.setPageId(
                          account.page_id
                        )
                      }
                      className={`
                        relative
                        rounded-2xl
                        border
                        p-4
                        text-left
                        transition-all

                        ${active

                          ? `
                            border-orange-500
                            bg-orange-500/20
                            shadow-[0_0_30px_rgba(255,120,0,0.25)]
                          `

                          : `
                            border-white/10
                            bg-black/30
                            hover:bg-white/5
                          `
                        }
                      `}
                    >

                      <div
                        className="
                          text-white
                          font-semibold
                          text-sm
                          mb-1
                        "
                      >
                        {account.page_name}
                      </div>

                      <div
                        className="
                          text-white/40
                          text-xs
                          uppercase
                          tracking-[0.2em]
                        "
                      >
                        Meta Connected
                      </div>

                      {active && (

                        <div
                          className="
                            absolute
                            top-3
                            right-3
                            w-2
                            h-2
                            rounded-full
                            bg-orange-400
                          "
                        />

                      )}

                    </button>

                  );

                }
              )}

            </div>

          </div>

        </div>

      </div>

      {/* AI SETTINGS */}

      <div
        className="
          bg-white/5
          border
          border-white/10
          rounded-2xl
          p-5
          mb-6
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
          AI Settings
        </div>

        <ControlPanel
          poster={poster}
        />

      </div>

      {/* ENHANCE ENGINE */}

      {poster.engine ===
        "enhance" && (

        <div
          className="
            mb-6
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
              mb-4
            "
          >
            Venue Assets
          </div>

          <input
            type="file"
            multiple
            accept="image/*"
            onChange={async (e) => {

              const files =
                Array.from(
                  e.target.files || []
                );

              poster.setInteriorImages(
                files
              );

              for (const file of files) {

                const analysis =
                  await analyzeMarketingAsset({

                    assetType:
                      "interior",

                  });

                await uploadMarketingAsset({

                  file,

                  tenantId,

                  assetType:
                    "interior",

                  analysis,

                });

              }

            }}
            className="
              w-full
              bg-black/40
              border
              border-white/10
              rounded-xl
              p-4
              text-white
            "
          />

          {poster.interiorImages
            ?.length > 0 && (

            <div
              className="
                grid
                grid-cols-3
                gap-3
                mt-5
              "
            >

              {poster.interiorImages.map(
                (file, index) => (

                  <img
                    key={index}
                    src={URL.createObjectURL(file)}
                    alt=""
                    className="
                      w-full
                      h-24
                      object-cover
                      rounded-xl
                    "
                  />

                )
              )}

            </div>

          )}

        </div>

      )}

      {/* COMPOSITE ENGINE */}

      {poster.engine ===
        "composite" && (

        <div className="space-y-5 mb-6">

          {/* STAFF */}

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
                mb-4
              "
            >
              Staff Images
            </div>

            <input
              type="file"
              multiple
              accept="image/*"
              onChange={async (e) => {

                const files =
                  Array.from(
                    e.target.files || []
                  );

                poster.setStaffImages(
                  files
                );

                for (const file of files) {

                  const analysis =
                    await analyzeMarketingAsset({

                      assetType:
                        "staff",

                    });

                  await uploadMarketingAsset({

                    file,

                    tenantId,

                    assetType:
                      "staff",

                    analysis,

                  });

                }

              }}
              className="
                w-full
                bg-black/40
                border
                border-white/10
                rounded-xl
                p-4
                text-white
              "
            />

            {poster.staffImages
              ?.length > 0 && (

              <div
                className="
                  grid
                  grid-cols-3
                  gap-3
                  mt-5
                "
              >

                {poster.staffImages.map(
                  (file, index) => (

                    <img
                      key={index}
                      src={URL.createObjectURL(file)}
                      alt=""
                      className="
                        w-full
                        h-24
                        object-cover
                        rounded-xl
                      "
                    />

                  )
                )}

              </div>

            )}

          </div>

          {/* INTERIOR */}

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
                mb-4
              "
            >
              Interior Images
            </div>

            <input
              type="file"
              multiple
              accept="image/*"
              onChange={async (e) => {

                const files =
                  Array.from(
                    e.target.files || []
                  );

                poster.setInteriorImages(
                  files
                );

                for (const file of files) {

                  const analysis =
                    await analyzeMarketingAsset({

                      assetType:
                        "interior",

                    });

                  await uploadMarketingAsset({

                    file,

                    tenantId,

                    assetType:
                      "interior",

                    analysis,

                  });

                }

              }}
              className="
                w-full
                bg-black/40
                border
                border-white/10
                rounded-xl
                p-4
                text-white
              "
            />

            {poster.interiorImages
              ?.length > 0 && (

              <div
                className="
                  grid
                  grid-cols-3
                  gap-3
                  mt-5
                "
              >

                {poster.interiorImages.map(
                  (file, index) => (

                    <img
                      key={index}
                      src={URL.createObjectURL(file)}
                      alt=""
                      className="
                        w-full
                        h-24
                        object-cover
                        rounded-xl
                      "
                    />

                  )
                )}

              </div>

            )}

          </div>

        </div>

      )}

    </div>

  );

}