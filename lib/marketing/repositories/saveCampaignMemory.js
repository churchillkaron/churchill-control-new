import { supabase }
from "@/lib/shared/supabase/client";

export async function saveCampaignMemory({

  tenantId,

  pageId,

  campaign,

}) {

  const { error } =

    await supabase

      .from(
        "campaign_memory"
      )

      .insert({

        tenant_id:
          tenantId,

        page_id:
          pageId,

        campaign_id:
          campaign.id,

        campaign_type:
          campaign.campaign_type,

        mood:
          campaign.mood,

        lighting:
          campaign.lighting,

        composition:
          campaign.composition,

        atmosphere:
          campaign.atmosphere,

        prompt:
          campaign.prompt,

        image_url:
          campaign.image_url,

      });

  if (error) {

    throw error;

  }

}