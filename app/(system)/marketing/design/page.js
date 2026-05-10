"use client";

import { useRef, useState }
from "react";

import { buildPrompt }
from "@/lib/ai/buildPrompt";

import { usePosterState }
from "@/hooks/usePosterState";

import { getCampaignMemory }
from "@/lib/supabase/getCampaignMemory";

import { getCampaignRecommendation }
from "@/lib/ai/getCampaignRecommendation";

import { getTopPerformingCampaigns }
from "@/lib/ai/getTopPerformingCampaigns";

import { createCampaignFlow }
from "@/lib/services/createCampaignFlow";

import StudioTopBar
from "../../components/marketing/studio/StudioTopBar";

import StudioLeftPanel
from "../../components/marketing/studio/StudioLeftPanel";

import StudioCenterStage
from "../../components/marketing/studio/StudioCenterStage";

import StudioRightPanel
from "../../components/marketing/studio/StudioRightPanel";

export default function Page() {

  const tenantId =
    "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

  const poster =
    usePosterState();

  const posterExportNodeRef =
    useRef(null);

  const [loading, setLoading] =
    useState(false);

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

`;

      const campaign =
        await createCampaignFlow({

          tenantId,

          prompt,

          poster,

        });

      poster.setSelectedImage(
        campaign.image_url
      );

    } catch (err) {

      console.error(
        "CAMPAIGN GENERATION ERROR:",
        err
      );

      alert(
        JSON.stringify(err)
      );

    } finally {

      setLoading(false);

    }

  }

  return (

    <div
      className="
        min-h-screen
        bg-black
        text-white
        overflow-hidden
      "
    >

      <StudioTopBar
        poster={poster}
      />

      <div
        className="
          relative
          h-[calc(100vh-90px)]
        "
      >

        <StudioLeftPanel
          poster={poster}
        />

        <StudioCenterStage
          poster={poster}
          exportRef={
            posterExportNodeRef
          }
        />

        <StudioRightPanel
          poster={poster}
          loading={loading}
          generateAIImage={
            generateAIImage
          }
          exportRef={
            posterExportNodeRef
          }
        />

      </div>

    </div>

  );

}