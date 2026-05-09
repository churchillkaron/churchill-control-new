import { generateCampaign }
from "@/lib/ai/generateCampaign";

import { uploadCampaignImage }
from "@/lib/supabase/uploadCampaignImage";

import { saveCampaign }
from "@/lib/supabase/saveCampaign";

import { saveCampaignMemory }
from "@/lib/supabase/saveCampaignMemory";

import { queueCampaign }
from "@/lib/supabase/queueCampaign";

export async function createCampaignFlow({

  tenantId,

  prompt,

  poster,

  pageId,

}) {

  const generated =
    await generateCampaign({
      prompt,
    });

  if (!generated?.url) {

    throw new Error(
      "Generation failed"
    );

  }

  const imageBlob =
    await fetch(
      generated.url
    ).then((response) =>
      response.blob()
    );

  const uploadedImageUrl =
    await uploadCampaignImage({

      file:
        imageBlob,

      tenantId,

    });

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

    status:
      "draft",

  };

  // SAVE CAMPAIGN

  const savedCampaign =
    await saveCampaign(
      campaign
    );

  // SAVE MEMORY

  await saveCampaignMemory({

    tenantId,

    campaign:
      savedCampaign,

  });

  // CREATE QUEUE ITEM

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

  };

}