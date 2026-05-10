import { uploadCampaignImage }
from "@/lib/supabase/uploadCampaignImage";

import { saveCampaign }
from "@/lib/supabase/saveCampaign";

import { saveCampaignMemory }
from "@/lib/supabase/saveCampaignMemory";

import { queueCampaign }
from "@/lib/supabase/queueCampaign";

import buildCampaignCaption
from "@/lib/ai/buildCampaignCaption";

import engineRouter
from "@/lib/ai/engineRouter";

import { createGenerationJob }
from "@/lib/supabase/createGenerationJob";

import { getMarketingAssets }
from "@/lib/supabase/getMarketingAssets";

import { selectBestAssets }
from "@/lib/ai/selectBestAssets";

import { incrementAssetUsage }
from "@/lib/supabase/incrementAssetUsage";

import { savePromptHistory }
from "@/lib/supabase/savePromptHistory";

import { buildCampaignDNA }
from "@/lib/ai/buildCampaignDNA";

export async function createCampaignFlow({

  tenantId,

  prompt,

  poster,

  pageId,

  imageUrl,

  provider,

}) {

  if (!imageUrl) {

    throw new Error(
      "Generation failed"
    );

  }

  // FETCH GENERATED IMAGE

  const imageBlob =
    await fetch(
      imageUrl
    ).then((response) =>
      response.blob()
    );

  // UPLOAD TO STORAGE

  const uploadedImageUrl =
    await uploadCampaignImage({

      file:
        imageBlob,

      tenantId,

    });

  // BUILD AI CONTENT

  const contentData =
    await buildCampaignCaption({

      venue:
        poster.venue,

      campaignType:
        poster.campaignType,

      mood:
        poster.mood,

      atmosphere:
        poster.atmosphere,

      subject:
        poster.subject,

    });

    const engineConfig =
  engineRouter(
    poster.engine
  );

  const allAssets =
  await getMarketingAssets({

    tenantId,

  });

const selectedAssets =
  selectBestAssets({

    assets:
      allAssets,

    mood:
      poster.mood,

    sceneType:
      poster.campaignType,

    limit: 4,

  });

  const assetContext =

  selectedAssets
    .map((asset) => {

      return `

Asset:
${asset.name}

Type:
${asset.asset_type}

Tags:
${(asset.tags || []).join(", ")}

Mood:
${asset.analysis?.mood || ""}

Lighting:
${asset.analysis?.lighting || ""}

Scene:
${asset.analysis?.sceneType || ""}

`;

    })
    .join("\n");

    for (const asset of selectedAssets) {

  await incrementAssetUsage({

    assetId:
      asset.id,

  });

}
await savePromptHistory({

  tenantId,

  prompt: `

${prompt}

ASSET CONTEXT:

${assetContext}

`,

  recommendation: {

    mood:
      poster.mood,

    lighting:
      poster.lighting,

    campaignType:
      poster.campaignType,

  },

  selectedAssets,

});

const dna =
  buildCampaignDNA({

    assets:
      selectedAssets,

    recommendation: {

      mood:
        poster.mood,

      lighting:
        poster.lighting,

      sceneType:
        poster.campaignType,

    },

  });
  // CAMPAIGN OBJECT

  const campaign = {

    tenant_id:
      tenantId,

    page_id:
      pageId,

    campaign_type:
      poster.campaignType,

    layout:
      poster.layout,

    title:
      poster.campaignTitle,

    subtitle:
      poster.campaignSubtitle,

    content:
      contentData.fullContent,

    mood:
      poster.mood,

    lighting:
      poster.lighting,

    composition:
      poster.composition,

    atmosphere:
      poster.atmosphere,

    venue:
      poster.venue,

    subject:
      poster.subject,

    extra_direction:
      poster.extraDirection,

  prompt: `

${prompt}

ASSET CONTEXT:

${assetContext}

`,

    image_url:
      uploadedImageUrl,
 
      engine:
      poster.engine,

    provider:
  engineConfig.provider,

  selected_assets:
  selectedAssets,


    status:
  "processing",

  };

  // SAVE CAMPAIGN

  const savedCampaign =
    await saveCampaign(
      campaign
    );

    const generationJob =
  await createGenerationJob({

  tenantId,

  campaignId:
    savedCampaign.id,

  engine:
    poster.engine,

  provider:
    engineConfig.provider,

  prompt,

  input: {

  poster,

  selectedAssets,

  assetContext,

},

});

await fetch(
  "/api/marketing/process-generation-job",
  {

    method: "POST",

    headers: {
      "Content-Type":
        "application/json",
    },

    body: JSON.stringify({

      jobId:
        generationJob.id,

    }),

  }
);

  // SAVE MEMORY

  await saveCampaignMemory({

    tenantId,

    campaign:
      savedCampaign,

  });

  // QUEUE CAMPAIGN

  const queueResult =
    await queueCampaign({

      campaignId:
        savedCampaign.id,

      tenantId:
        savedCampaign.tenant_id,

      platform:
        "meta",

      scheduledFor:
        new Date()
          .toISOString(),

    });

  console.log(
    "QUEUE RESULT:",
    queueResult
  );

  return {

    ...savedCampaign,

   queue:
  queueResult,

generationJob,

  };

}