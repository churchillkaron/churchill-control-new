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

<div className="min-h-screen bg-black text-white overflow-hidden">

  {/* TOP BAR */}

  <div
    className="
      h-[90px]
      border-b
      border-white/10
      flex
      items-center
      justify-between
      px-10
      backdrop-blur-xl
      bg-black/70
      sticky
      top-0
      z-50
    "
  >

    <div>

      <div
        className="
          text-3xl
          font-light
          tracking-tight
        "
      >
        Churchill AI Studio
      </div>

      <div
        className="
          text-white/40
          text-sm
          mt-1
        "
      >
        Luxury Hospitality Creative Engine
      </div>

    </div>

    <div
      className="
        flex
        items-center
        gap-4
      "
    >

      <button
  onClick={() =>
    poster.setEngine(
      "full-ai"
    )
  }
  className={`
    px-5
    py-3
    rounded-2xl
    font-semibold
    transition-all

    ${
      poster.engine ===
      "full-ai"

        ? "bg-orange-500 text-black"

        : `
          bg-white/5
          border
          border-white/10
          text-white/70
        `
    }
  `}
>
  Full AI
</button>

      <button
  onClick={() =>
    poster.setEngine(
      "enhance"
    )
  }
  className={`
    px-5
    py-3
    rounded-2xl
    font-semibold
    transition-all

    ${
      poster.engine ===
      "enhance"

        ? "bg-orange-500 text-black"

        : `
          bg-white/5
          border
          border-white/10
          text-white/70
        `
    }
  `}
>
  Enhance
</button>

      <button
  onClick={() =>
    poster.setEngine(
      "composite"
    )
  }
  className={`
    px-5
    py-3
    rounded-2xl
    font-semibold
    transition-all

    ${
      poster.engine ===
      "composite"

        ? "bg-orange-500 text-black"

        : `
          bg-white/5
          border
          border-white/10
          text-white/70
        `
    }
  `}
>
  Composite
</button>

      <a
        href="/api/meta/auth"
        className="
          bg-blue-600
          hover:bg-blue-500
          transition-all
          px-6
          py-3
          rounded-2xl
          font-semibold
        "
      >
        Connect Meta
      </a>

    </div>

  </div>

  {/* MAIN CANVAS */}

  <div
    className="
      relative
      h-[calc(100vh-90px)]
      flex
      items-center
      justify-center
      p-10
    "
  >

    {/* LEFT FLOATING PANEL */}

    <div
      className="
        absolute
        left-8
        top-8
        bottom-8
        w-[320px]
        bg-black/50
        border
        border-white/10
        rounded-[32px]
        backdrop-blur-2xl
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
        Creative Direction
      </div>
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
  onChange={(e) => {

    const files =
      Array.from(
        e.target.files || []
      );

    poster.setInteriorImages(
      files
    );

  }}
  className="
    w-full
    bg-black/40
    border
    border-white/10
    rounded-xl
    p-4
  "
/>

    <div
      className="
        text-white/40
        text-sm
        mt-3
      "
    >
      Upload interior, food,
      cocktail or venue photos.
    </div>

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

{poster.engine ===
  "composite" && (

  <div className="space-y-5 mb-6">

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
  onChange={(e) => {

    const files =
      Array.from(
        e.target.files || []
      );

    poster.setStaffImages(
      files
    );

  }}
  className="
    w-full
    bg-black/40
    border
    border-white/10
    rounded-xl
    p-4
  "
/>

    </div>
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
  onChange={(e) => {

    const files =
      Array.from(
        e.target.files || []
      );

    poster.setInteriorImages(
      files
    );

  }}
  className="
    w-full
    bg-black/40
    border
    border-white/10
    rounded-xl
    p-4
  "
/>

    </div>

  </div>

)}
      <ControlPanel
        poster={poster}
      />

    </div>

    {/* CENTER CAMPAIGN */}

    <div
      className="
        relative
        w-full
        h-full
        flex
        items-center
        justify-center
      "
    >

      <div
        className="
          absolute
          top-8
          left-1/2
          -translate-x-1/2
          z-30
          flex
          items-center
          gap-3
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
          "
        >
          AI Render
        </div>

      </div>

      <div
        className="
          w-full
          max-w-[850px]
          h-full
          flex
          items-center
          justify-center
        "
      >

        <PosterPreview
          poster={poster}
          exportRef={
            posterExportNodeRef
          }
        />

      </div>

    </div>

    {/* RIGHT FLOATING PANEL */}

    <div
      className="
        absolute
        right-8
        top-8
        bottom-8
        w-[340px]
        bg-black/50
        border
        border-white/10
        rounded-[32px]
        backdrop-blur-2xl
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
              bg-white/5
              rounded-2xl
              p-5
            "
          >

            <div className="text-white/40 text-sm mb-2">
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

            <div className="text-white/40 text-sm mb-2">
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

            <div className="text-white/40 text-sm mb-2">
              AI Recommendation
            </div>

            <div className="text-white/80 leading-7">
              Luxury campaigns published
              between 7PM–10PM generated
              the strongest engagement.
            </div>

          </div>

        </div>

      </div>

    </div>

  </div>

</div>

);
}