"use client";

import ExportControls
from "../ExportControls";

import { queueCampaign }
from "@/lib/supabase/queueCampaign";

import QueuePanel
from "./QueuePanel";

import { getQueuedCampaigns }
from "@/lib/supabase/getQueuedCampaigns";

export default function StudioRightPanel({

  loading,

  generateAIImage,

  exportRef,

  latestCampaign,

  queuedCampaigns,

  setQueuedCampaigns,

}) {

  async function handleQueueCampaign() {

    try {

      if (!latestCampaign?.id) {

        alert(
          "Generate a campaign first"
        );
        const updatedQueue =
  await getQueuedCampaigns({

    tenantId:
      latestCampaign.tenant_id,

  });

setQueuedCampaigns(
  updatedQueue
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

    scheduledFor:

      poster.scheduledDate &&
      poster.scheduledTime

        ? new Date(

            `${poster.scheduledDate}T${poster.scheduledTime}`

          ).toISOString()

        : new Date()
            .toISOString(),

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
        Campaign Workflow
      </div>

      {/* GENERATE */}

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

      {/* CAMPAIGN STATUS */}

      {latestCampaign ? (

        <div
          className="
            bg-white/5
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
                {latestCampaign.status}
              </div>

            </div>

          </div>

        </div>

      ) : (

        <div
          className="
            bg-white/5
            rounded-2xl
            p-5
            mb-5
            text-white/50
            text-sm
          "
        >
          No campaign generated yet.
        </div>

      )}
<QueuePanel
  queuedCampaigns={
    queuedCampaigns
  }
/>
      {/* QUEUE */}

      <button
        onClick={handleQueueCampaign}
        disabled={!latestCampaign}
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
          disabled:opacity-40
        "
      >
        Queue Campaign
      </button>

      {/* PUBLISH */}

      <button
        onClick={handlePublishNow}
        disabled={!latestCampaign}
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
          disabled:opacity-40
        "
      >
        Publish Now
      </button>

      {/* EXPORT */}

      <ExportControls
        exportRef={exportRef}
      />

      {/* AI INSIGHTS */}

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