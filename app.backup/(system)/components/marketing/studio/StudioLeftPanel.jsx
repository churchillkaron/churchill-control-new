"use client";

export default function StudioLeftPanel({

  poster,

  metaAccounts = [],

}) {

  return (

    <div
      className="
        absolute
        left-8
        top-8
        bottom-8
        w-[380px]
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

      {/* BUSINESS / META */}

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
            flex
            items-center
            justify-between
            mb-5
          "
        >

          <div
            className="
              text-orange-500
              uppercase
              tracking-[0.2em]
              text-xs
            "
          >
            Connected Businesses
          </div>

          <div
            className="
              text-white/40
              text-[10px]
            "
          >
            Meta Connected
          </div>

        </div>

        <div
          className="
            grid
            grid-cols-1
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

                  onClick={() => {

  poster.setPageId(
    account.page_id
  );

 

}}

                  className={`

                    relative
                    rounded-2xl
                    border
                    p-4
                    text-left
                    transition-all

                    ${
                      active

                        ? `
                          border-orange-500
                          bg-orange-500/20
                          shadow-[0_0_25px_rgba(255,115,0,0.15)]
                        `

                        : `
                          border-white/10
                          bg-black/30
                          hover:border-orange-500/30
                        `
                    }

                  `}
                >

                  <div
                    className="
                      flex
                      items-center
                      justify-between
                    "
                  >

                    <div>

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
                        "
                      >
                        Facebook + Instagram
                      </div>

                    </div>

                    <div
                      className={`
                        w-3
                        h-3
                        rounded-full

                        ${
                          active
                            ? "bg-green-400"
                            : "bg-white/20"
                        }
                      `}
                    />

                  </div>

                </button>

              );

            }
          )}

        </div>

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
            placeholder="Optional Event Date"
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
            placeholder="Optional Event Time"
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

          <input
            type="text"
            value={
              poster.footer || ""
            }
            onChange={(e) =>
              poster.setFooter(
                e.target.value
              )
            }
            placeholder="Call To Action"
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

        <div className="space-y-5">

          <input
            type="file"
            accept="image/*"
            onChange={(e) => {

              const file =
                e.target.files?.[0];

              if (!file) return;

              const reader =
                new FileReader();

              reader.onloadend = () => {

                poster.setSelectedImage(
                  reader.result
                );

              };

              reader.readAsDataURL(file);

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

          <select
            value={poster.layout}
            onChange={(e) =>
              poster.setLayout(
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
          >

            <option value="Classic">
              Classic
            </option>

            <option value="Centered">
              Centered
            </option>

            <option value="Minimal">
              Minimal
            </option>

            <option value="Luxury">
              Luxury
            </option>

          </select>

          <select
            value={poster.engine}
            onChange={(e) =>
              poster.setEngine(
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
          >

            <option value="full-ai">
              Full AI
            </option>

            <option value="enhance">
              Enhance Existing
            </option>

            <option value="composite">
              Composite Assets
            </option>

            <option value="video">
              Video Campaign
            </option>

          </select>

          <select
            value={poster.mood}
            onChange={(e) =>
              poster.setMood(
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
          >

            <option>
              Luxury Nightlife
            </option>

            <option>
              Elegant Dinner
            </option>

            <option>
              Party Energy
            </option>

            <option>
              Romantic Lounge
            </option>

          </select>

          <select
            value={poster.lighting}
            onChange={(e) =>
              poster.setLighting(
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
          >

            <option>
              Cinematic Warm
            </option>

            <option>
              Neon Nightclub
            </option>

            <option>
              Moody Dark
            </option>

            <option>
              Golden Luxury
            </option>

          </select>

          <select
            value={poster.composition}
            onChange={(e) =>
              poster.setComposition(
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
          >

            <option>
              Hero Shot
            </option>

            <option>
              Cinematic Portrait
            </option>

            <option>
              Crowd Energy
            </option>

            <option>
              Table Experience
            </option>

          </select>

          <input
            value={poster.campaignTitle}
            onChange={(e) =>
              poster.setCampaignTitle(
                e.target.value
              )
            }
            placeholder="Campaign Title"
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

          <input
            value={poster.campaignSubtitle}
            onChange={(e) =>
              poster.setCampaignSubtitle(
                e.target.value
              )
            }
            placeholder="Campaign Subtitle"
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

          <textarea
            value={poster.extraDirection}
            onChange={(e) =>
              poster.setExtraDirection(
                e.target.value
              )
            }
            placeholder="Extra AI Direction"
            rows={5}
            className="
              w-full
              bg-black/40
              border
              border-white/10
              rounded-xl
              p-4
              text-white
              resize-none
            "
          />

        </div>

      </div>

    </div>

  );

}