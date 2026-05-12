import { buildPrompt }
from "@/lib/marketing/ai/context/buildPrompt";

import { getCampaignMemory }
from "@/lib/supabase/getCampaignMemory";

import { getCampaignRecommendation }
from "@/lib/marketing/ai/recommendations/getCampaignRecommendation";

import { getTopPerformingCampaigns }
from "@/lib/marketing/ai/utils/getTopPerformingCampaigns";

import { createCampaignFlow }
from "@/lib/services/createCampaignFlow";

import { saveCampaignAssetUsage }
from "@/lib/supabase/saveCampaignAssetUsage";

import { buildCampaignContext }
from "@/lib/marketing/ai/context/buildCampaignContext";

import { buildAssetIntelligence }
from "@/lib/marketing/ai/assets/buildAssetIntelligence";

import { runGenerationEngine }
from "@/lib/marketing/ai/runtime/runGenerationEngine";

import { createGenerationJob }
from "@/lib/supabase/createGenerationJob";

import { updateGenerationJob }
from "@/lib/supabase/updateGenerationJob";

import { supabase }
from "@/lib/supabase";



export async function runCampaignGeneration({

  tenantId,

  poster,

  selectedAssets,

  pageId,

  selectedBusiness,
  

}) {

  let generationJob = null;

  try {

    // MEMORY

    const memory =
  await getCampaignMemory({

    tenantId,

    campaignType:
      poster.campaignType,

    pageId,

  });

    // TOP CAMPAIGNS

    const topCampaigns =
  await getTopPerformingCampaigns({

    tenantId,

    pageId,

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

        pageId,

        selectedBusiness,

        businessName:
        selectedBusiness?.page_name || "",

        instagramBusinessId:
        selectedBusiness
         ?.instagram_business_id || "",

    };

    // BASE PROMPT

    const basePrompt =
  await buildPrompt({

    ...promptState,

    pageId,

    selectedBusiness,

  });

    // AI CONTEXT
const {
  data: businessProfile,
} = await supabase

  .from(
    "business_ai_profiles"
  )

  .select("*")

  .eq(
    "tenant_id",
    tenantId
  )

  .eq(
    "page_id",
    pageId
  )

  .single();

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

    businessProfile,

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

    pageId,

    selectedBusiness,

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

  tenantId,

  pageId,

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