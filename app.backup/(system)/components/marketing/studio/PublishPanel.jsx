"use client";

export default function PublishPanel({

  loading,

  generateAIImage,

  exportRef,

  latestCampaign,

  pageId,

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
        Publish Actions
      </div>

      <div className="space-y-4">

        <button
          onClick={generateAIImage}

          disabled={
            loading ||
            !pageId
          }

          className={`

            w-full
            rounded-xl
            p-4
            font-semibold
            transition-all

            ${
              !pageId

                ? `
                  bg-white/10
                  text-white/30
                  cursor-not-allowed
                `

                : `
                  bg-orange-500
                  hover:bg-orange-400
                  text-black
                `
            }

          `}
        >

          {loading
            ? "Generating..."
            : !pageId
              ? "Choose Business First"
              : "Generate AI"}

        </button>

        <button
          disabled={!pageId}
          className={`

            w-full
            transition-all
            rounded-xl
            p-4
            font-semibold

            ${
              !pageId

                ? `
                  bg-white/10
                  text-white/30
                  cursor-not-allowed
                `

                : `
                  bg-white/10
                  hover:bg-white/20
                `
            }

          `}
        >
          Queue Campaign
        </button>

        <button
          disabled={!pageId}
          className={`

            w-full
            transition-all
            rounded-xl
            p-4
            font-semibold

            ${
              !pageId

                ? `
                  bg-white/10
                  text-white/30
                  cursor-not-allowed
                `

                : `
                  bg-white/10
                  hover:bg-white/20
                `
            }

          `}
        >
          Publish Now
        </button>

        {!pageId && (

          <div
            className="
              text-[11px]
              text-orange-300/70
              leading-relaxed
              pt-2
            "
          >
            Select a connected Meta business before generating campaigns.
          </div>

        )}

      </div>

    </div>

  );

}