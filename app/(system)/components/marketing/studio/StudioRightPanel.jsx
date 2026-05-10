"use client";

import ExportControls
from "../ExportControls";

import { queueCampaign }
from "@/lib/supabase/queueCampaign";

export default function StudioRightPanel({

  loading,

  generateAIImage,

  exportRef,

  latestCampaign,

}) {

  async function handleQueueCampaign() {

    try {

      if (!latestCampaign?.id) {

        alert(
          "Generate a campaign first"
        );

        return;

      }

      const result =
        await queueCampaign({

          campaignId:
            latestCampaign.id,

          tenantId:
            latestCampaign.tenant_id,

          platform:
            "meta",

        });

      if (!result.success) {

        alert(
          JSON.stringify(
            result.error
          )
        );

        return;

      }

      alert(
        "Campaign queued successfully"
      );

    } catch (err) {

      console.error(
        "QUEUE CAMPAIGN ERROR:",
        err
      );

      alert(
        err.message
      );

    }

  }

  async function handlePublishNow() {

    alert(
      "Instant publishing connected next."
    );

  }

  return (

    <div
      className="
        absolute
        right-8
        top-8
        bottom-8
        w-[260px]
        bg-white/[0.03]
        backdrop-blur-2xl
        rounded-[32px]
        p-6
        overflow-auto
        z-20
      "
    >

      <div
        className="
          text-orange-500
          uppercase
          tracking-[0.3em]
          text-xs
          mb-6
        "
      >
        Campaign Workflow
      </div>

      <button
        onClick={generateAIImage}
        disabled={loading}
        className="
          w-full
          bg-orange-500
          hover:bg-orange-400
          transition-all
          text-black
          px-8
          py-5
          rounded-2xl
          font-bold
          text-lg
          mb-5
          disabled:opacity-50
        "
      >
        {loading
          ? "Generating..."
          : "Generate Campaign"}
      </button>

      <button
        onClick={handleQueueCampaign}
        className="
          w-full
          bg-blue-600
          hover:bg-blue-500
          transition-all
          text-white
          px-8
          py-5
          rounded-2xl
          font-bold
          text-lg
          mb-5
        "
      >
        Queue Campaign
      </button>

      <button
        onClick={handlePublishNow}
        className="
          w-full
          bg-green-600
          hover:bg-green-500
          transition-all
          text-white
          px-8
          py-5
          rounded-2xl
          font-bold
          text-lg
          mb-5
        "
      >
        Publish Now
      </button>

      <ExportControls
        exportRef={exportRef}
      />

      <div
        className="
          border-t
          border-white/10
          mt-8
          pt-8
        "
      >

        <div
          className="
            text-orange-500
            uppercase
            tracking-[0.3em]
            text-xs
            mb-5
          "
        >
          AI Insights
        </div>

        <div className="space-y-4">

          <div
            className="
              bg-white/5
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

            <div className="text-2xl">
              Luxury Nightlife
            </div>

          </div>

          <div
            className="
              bg-white/5
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

            <div className="text-2xl">
              Cinematic Warm
            </div>

          </div>

          <div
            className="
              bg-white/5
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
              "
            >
              Luxury campaigns published
              between 7PM–10PM generated
              the strongest engagement.
            </div>

          </div>

        </div>

      </div>

    </div>

  );

}