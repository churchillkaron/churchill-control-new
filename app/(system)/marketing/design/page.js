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


export default function Page() {
 
const tenantId =
  "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";
  
  const posterExportNodeRef = useRef(null);


 

  const [loading, setLoading] = useState(false);

  
    const poster = usePosterState();

    const promptState = {

  campaignType:
    poster.campaignType,

  mood:
    poster.mood,

  lighting:
    poster.lighting,

  composition:
    poster.composition,

  atmosphere:
    poster.atmosphere,

  subject:
    poster.subject,

  venue:
    poster.venue,

  extraDirection:
    poster.extraDirection,
};

const basePrompt =
  buildPrompt(promptState);
    

  async function generateAIImage() {

  try {

    setLoading(true);

    const memory =
      await getCampaignMemory({
        tenantId,
        campaignType:
          poster.campaignType,
      });

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

    const recommendation =
      getCampaignRecommendation(
        memory
      );

    const basePrompt =
  await buildPrompt(promptState);

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

    <div className="max-w-[1600px] mx-auto">

      <div className="mb-10">

        <h1 className="text-5xl font-light">
          AI Poster Studio
        </h1>

        <div className="text-white/50 mt-3">
          Churchill Marketing System
        </div>

      </div>

      <div className="grid lg:grid-cols-2 gap-10">

        <div className="space-y-6">

          <ControlPanel
            poster={poster}
          />

          <button
            onClick={generateAIImage}
            disabled={loading}
            className="
              w-full
              bg-blue-500
              text-white
              px-8
              py-4
              rounded-xl
              font-bold
              disabled:opacity-50
            "
          >
            {loading
              ? "Generating..."
              : "Generate AI Campaign"}
          </button>

          <ExportControls
            exportRef={
              posterExportNodeRef
            }
          />

        </div>

        <PosterPreview
          poster={poster}
          exportRef={
            posterExportNodeRef
          }
        />

      </div>

    </div>

  </div>

);
}