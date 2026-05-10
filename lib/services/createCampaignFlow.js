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

    prompt,

    image_url:
      uploadedImageUrl,
 
      engine:
      poster.engine,

    provider:
  engineConfig.provider,


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