import { buildPrompt }
from "@/lib/ai/buildPrompt";

import { getCampaignMemory }
from "@/lib/supabase/getCampaignMemory";

import { getCampaignRecommendation }
from "@/lib/utils/getCampaignRecommendation";

import { getTopPerformingCampaigns }
from "@/lib/utils/getTopPerformingCampaigns";

import { createCampaignFlow }
from "@/lib/services/createCampaignFlow";

import { saveCampaignAssetUsage }
from "@/lib/supabase/saveCampaignAssetUsage";

import { buildCampaignContext }
from "@/lib/ai/buildCampaignContext";

import { buildAssetIntelligence }
from "@/lib/ai/buildAssetIntelligence";

import { runGenerationEngine }
from "@/lib/ai/runGenerationEngine";

import { createGenerationJob }
from "@/lib/supabase/createGenerationJob";

import { updateGenerationJob }
from "@/lib/supabase/updateGenerationJob";

export async function runCampaignGeneration({

  tenantId,

  poster,
  

}) {

  let generationJob = null;

  try {

    // MEMORY

    const memory =
      await getCampaignMemory({

        tenantId,

        campaignType:
          poster.campaignType,

      });

    // TOP CAMPAIGNS

    const topCampaigns =
      await getTopPerformingCampaigns({

        tenantId,

        limit: 5,

      });

    // RECOMMENDATION

    const recommendation =
      getCampaignRecommendation(
        topCampaigns
      );

    // ASSET INTELLIGENCE

    const assetIntelligence =
      await buildAssetIntelligence({

        tenantId,

        poster,

      });

    // PROMPT STATE

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

    // BASE PROMPT

    const basePrompt =
      await buildPrompt(
        promptState
      );

    // AI CONTEXT

    const aiContext =
      await buildCampaignContext({

        memory,

        selectedInteriorAssets:
          assetIntelligence
            .selectedInteriorAssets,

        selectedStaffAssets:
          assetIntelligence
            .selectedStaffAssets,

        topAssets:
          assetIntelligence
            .topAssets,

      });

    // FINAL PROMPT

    const prompt = `

${basePrompt}

${aiContext}

`;

    // CREATE JOB

    generationJob =
      await createGenerationJob({

        tenantId,

        engine:
          poster.engine,

        provider:
          "pending",

        prompt,

        input: {

          campaignType:
            poster.campaignType,

          mood:
            poster.mood,

          atmosphere:
            poster.atmosphere,

        },

      });

    // UPDATE JOB → PROCESSING

    await updateGenerationJob({

      jobId:
        generationJob.id,

      updates: {

        status:
          "processing",

        started_at:
          new Date()
            .toISOString(),

      },

    });

    // RUN ENGINE

    const generation =
      await runGenerationEngine({
       
        engine:
          poster.engine,

        prompt,

        poster,

      });
console.log(
  "GENERATION RESPONSE:",
  generation
);
    console.log(
      "GENERATION JOB:",
      generationJob.id
    );

    // UPDATE JOB → COMPLETED

    await updateGenerationJob({

      jobId:
        generationJob.id,

      updates: {

        status:
          "completed",

        provider:
          generation.provider,

        output:
          generation,

        completed_at:
          new Date()
            .toISOString(),

      },

    });

    // CREATE CAMPAIGN

    const campaign =
      await createCampaignFlow({

        tenantId,

        prompt,

        poster,

        pageId:
  poster.pageId,

        imageUrl:
          generation.imageUrl,

        provider:
          generation.provider,

      });

    // SAVE ASSET USAGE

    await saveCampaignAssetUsage({

      campaignId:
        campaign.id,

      assets: [

        ...assetIntelligence
          .selectedInteriorAssets,

        ...assetIntelligence
          .selectedStaffAssets,

      ],

    });

    return campaign;

  } catch (err) {

    console.error(
      "RUN CAMPAIGN GENERATION ERROR:",
      err
    );

    // UPDATE JOB → FAILED

    if (generationJob?.id) {

      await updateGenerationJob({

        jobId:
          generationJob.id,

        updates: {

          status:
            "failed",

          error:
            err.message,

        },

      });

    }

    throw err;

  }

}