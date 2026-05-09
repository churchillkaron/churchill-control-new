"use client";

import { buildPrompt }
from "@/lib/ai/buildPrompt";

import { useRef, useState }
from "react";

import { usePosterState }
from "@/hooks/usePosterState";



import ControlPanel
from "../../components/marketing/ControlPanel";

import PosterPreview
from "../../components/marketing/PosterPreview";

import ExportControls
from "../../components/marketing/ExportControls";

import { useTenant }
from "@/app/providers/TenantProvider";

import { getCampaignMemory }
from "@/lib/supabase/getCampaignMemory";

import { getCampaignRecommendation }
from "@/lib/ai/getCampaignRecommendation";

import { createCampaignFlow }
from "@/lib/services/createCampaignFlow";

import { getTopPerformingCampaigns }
from "@/lib/ai/getTopPerformingCampaigns";




export default function Page() {
 
const tenantId =
  "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";
  
  const posterExportNodeRef = useRef(null);


 

  const [loading, setLoading] = useState(false);

  
    const poster = usePosterState();

    
    

  async function generateAIImage() {

  try {

    setLoading(true);

    const memory =
      await getCampaignMemory({
        tenantId,
        campaignType:
          poster.campaignType,
      });

    const topCampaigns =
  await getTopPerformingCampaigns({

    tenantId,

    limit: 5,

  });

const recommendation =
  getCampaignRecommendation(
    topCampaigns
  );

const memoryContext =
  memory
    .map((memoryItem) => `

Mood:
${memoryItem.mood}

Lighting:
${memoryItem.lighting}

Composition:
${memoryItem.composition}

Atmosphere:
${memoryItem.atmosphere}

`)
    .join("\n");

const promptState = {

  tenantId,

  campaignType:
    poster.campaignType,

  mood:
    recommendation.bestMood ||
    poster.mood,

  lighting:
    recommendation.bestLighting ||
    poster.lighting,

  composition:
    poster.composition,

  atmosphere:
    recommendation.bestAtmosphere ||
    poster.atmosphere,

  subject:
    poster.subject,

  venue:
    poster.venue,

  extraDirection:
    poster.extraDirection,
};

const basePrompt =
  await buildPrompt(
    promptState
  );

  
  const prompt = `

${basePrompt}

REFERENCE MEMORY:

${memoryContext}

IMPORTANT:
Maintain Churchill Phuket
brand consistency and
premium hospitality identity.

RECOMMENDATION:
${recommendation}
`;

   const campaign =
  await createCampaignFlow({
    tenantId,
    prompt,
    poster,

    pageId:
      poster.pageId,
  });

    poster.setSelectedImage(
      campaign.image_url
    );

  } catch (err) {

    console.error(
      "CAMPAIGN MEMORY ERROR:",
      err
    );

    alert(
      JSON.stringify(err)
    );

  } finally {

    setLoading(false);

  }

}

  async function exportPoster() {

    try {

      const node =
        posterExportNodeRef.current;

      if (!node) {

        alert("Poster node missing");

        return;
      }

      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#000000",
      });

      const win = window.open();

      if (!win) return;

      win.document.write(`
        <html>
          <body style="margin:0;background:black;">
            <img
              src="${dataUrl}"
              style="width:100%;display:block;"
            />
          </body>
        </html>
      `);

    } catch (err) {

      console.error(err);

      alert("Export failed");
    }
  }

  function renderOverlay() {

    switch (layout) {

      case "Centered":
        return (
          <div
            className="
              absolute
              inset-0
              flex
              items-center
              justify-center
              text-center
              z-20
              p-10
            "
          >
            <div>

              <div
                className="
                  uppercase
                  tracking-[0.4em]
                  text-orange-500
                  mb-6
                "
              >
                {campaignSubtitle}
              </div>

              <h1
                className="
                  text-8xl
                  uppercase
                  leading-none
                  mb-6
                "
              >
                {campaignTitle}
              </h1>

              <div
                className="
                  text-2xl
                  tracking-[0.2em]
                  uppercase
                  text-white/90
                "
              >
                {eventDate}
              </div>

            </div>
          </div>
        );

      case "Minimal":
        return (
          <div
            className="
              absolute
              bottom-10
              left-10
              z-20
            "
          >
            <h1
              className="
                text-6xl
                uppercase
                font-light
              "
            >
              {campaignTitle}
            </h1>
          </div>
        );

      case "Bottom Gradient":
        return (
          <>
            <div
              className="
                absolute
                inset-0
                bg-gradient-to-t
                from-black
                via-black/40
                to-transparent
                z-10
              "
            />

            <div
              className="
                absolute
                bottom-16
                left-10
                z-20
              "
            >

              <div
                className="
                  uppercase
                  tracking-[0.4em]
                  text-orange-500
                  mb-5
                "
              >
                {campaignSubtitle}
              </div>

              <h1
                className="
                  text-7xl
                  uppercase
                  leading-none
                  mb-5
                "
              >
                {campaignTitle}
              </h1>

              <div
                className="
                  text-xl
                  uppercase
                  tracking-[0.2em]
                  text-white/80
                  mb-6
                "
              >
                {eventDate}
              </div>

              <div
                className="
                  inline-flex
                  border
                  border-orange-500/40
                  rounded-full
                  px-6
                  py-3
                  text-orange-500
                  uppercase
                  tracking-[0.2em]
                  text-sm
                  bg-black/50
                "
              >
                {footer}
              </div>

            </div>
          </>
        );

      case "Classic":
      default:
        return (
          <div
            className="
              absolute
              bottom-20
              left-10
              z-20
            "
          >

            <div
              className="
                uppercase
                tracking-[0.4em]
                text-orange-500
                mb-5
              "
            >
              {campaignSubtitle}
            </div>

            <h1
              className="
                text-7xl
                uppercase
                leading-none
                mb-5
              "
            >
              {campaignTitle}
            </h1>

            <div
              className="
                text-2xl
                tracking-[0.2em]
                uppercase
                text-white/90
                mb-6
              "
            >
              {eventDate}
            </div>

            <div
              className="
                inline-flex
                border
                border-orange-500/40
                rounded-full
                px-6
                py-3
                text-orange-500
                uppercase
                tracking-[0.2em]
                text-sm
                bg-black/50
              "
            >
              {footer}
            </div>

          </div>
        );
    }
  }

  return (
<div className="min-h-screen bg-black text-white p-10">

  <div className="max-w-[1800px] mx-auto">

    <div className="mb-10">

      <div
        className="
          flex
          items-center
          justify-between
          gap-6
          flex-wrap
        "
      >

        <div>

          <h1
            className="
              text-6xl
              font-light
              tracking-tight
            "
          >
            Churchill AI Studio
          </h1>

          <div
            className="
              text-white/40
              mt-3
              text-lg
            "
          >
            Luxury Hospitality Marketing Engine
          </div>

        </div>

        <a
          href="/api/meta/auth"
          className="
            bg-blue-600
            hover:bg-blue-500
            transition-all
            px-6
            py-4
            rounded-2xl
            font-semibold
            shadow-2xl
          "
        >
          Connect Facebook & Instagram
        </a>

      </div>

      <div
        className="
          grid
          grid-cols-1
          lg:grid-cols-3
          gap-4
          mt-8
        "
      >

        <button
          className="
            bg-white/5
            border
            border-orange-500/40
            rounded-3xl
            p-6
            text-left
            hover:border-orange-500
            transition-all
          "
        >

          <div
            className="
              text-orange-500
              uppercase
              text-xs
              tracking-[0.3em]
              mb-4
            "
          >
            Engine 1
          </div>

          <div className="text-2xl mb-3">
            Full AI Generation
          </div>

          <div className="text-white/40">
            Generate full cinematic campaigns completely with AI.
          </div>

        </button>

        <button
          className="
            bg-white/5
            border
            border-white/10
            rounded-3xl
            p-6
            text-left
            hover:border-orange-500
            transition-all
          "
        >

          <div
            className="
              text-orange-500
              uppercase
              text-xs
              tracking-[0.3em]
              mb-4
            "
          >
            Engine 2
          </div>

          <div className="text-2xl mb-3">
            AI Enhancement
          </div>

          <div className="text-white/40">
            Upload real venue photos and enhance them into premium campaigns.
          </div>

        </button>

        <button
          className="
            bg-white/5
            border
            border-white/10
            rounded-3xl
            p-6
            text-left
            hover:border-orange-500
            transition-all
          "
        >

          <div
            className="
              text-orange-500
              uppercase
              text-xs
              tracking-[0.3em]
              mb-4
            "
          >
            Engine 3
          </div>

          <div className="text-2xl mb-3">
            AI Composite
          </div>

          <div className="text-white/40">
            Combine real staff, interiors and AI cinematic generation.
          </div>

        </button>

      </div>

    </div>

    <div
      className="
        grid
        grid-cols-1
        xl:grid-cols-[420px_1fr_420px]
        gap-8
        items-start
      "
    >

      <div
        className="
          bg-white/5
          border
          border-white/10
          rounded-[32px]
          p-8
          backdrop-blur-xl
          sticky
          top-8
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
          Campaign Controls
        </div>

        <ControlPanel
          poster={poster}
        />

      </div>

      <div className="space-y-6">

        <PosterPreview
          poster={poster}
          exportRef={
            posterExportNodeRef
          }
        />

        <div
          className="
            bg-white/5
            border
            border-white/10
            rounded-[32px]
            p-8
            backdrop-blur-xl
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
            AI Caption
          </div>

          <textarea
            placeholder="Write cinematic luxury nightlife caption..."
            className="
              w-full
              min-h-[180px]
              bg-black/40
              border
              border-white/10
              rounded-2xl
              p-5
              text-white
            "
          />

          <div className="mt-6">

            <div
              className="
                text-white/40
                mb-3
                text-sm
                uppercase
                tracking-[0.2em]
              "
            >
              Suggested Hashtags
            </div>

            <div
              className="
                text-orange-400
                leading-8
              "
            >
              #churchillphuket
              #luxurynightlife
              #phuketnightlife
              #cocktailbar
              #hospitalitymarketing
            </div>

          </div>

        </div>

      </div>

      <div
        className="
          bg-white/5
          border
          border-white/10
          rounded-[32px]
          p-8
          backdrop-blur-xl
          sticky
          top-8
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
          AI Actions
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
          exportRef={
            posterExportNodeRef
          }
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
                bg-black/30
                rounded-2xl
                p-5
              "
            >

              <div className="text-white/40 text-sm mb-2">
                Best Mood
              </div>

              <div className="text-xl">
                Luxury Nightlife
              </div>

            </div>

            <div
              className="
                bg-black/30
                rounded-2xl
                p-5
              "
            >

              <div className="text-white/40 text-sm mb-2">
                Best Lighting
              </div>

              <div className="text-xl">
                Cinematic Warm
              </div>

            </div>

            <div
              className="
                bg-black/30
                rounded-2xl
                p-5
              "
            >

              <div className="text-white/40 text-sm mb-2">
                AI Recommendation
              </div>

              <div className="text-white/80 leading-7">
                Campaigns posted between
                7PM and 10PM generated
                the strongest engagement.
              </div>

            </div>

          </div>

        </div>

      </div>

    </div>

  </div>

</div>

);
}