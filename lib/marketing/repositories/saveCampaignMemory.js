import { getServiceSupabase } from "@/lib/shared/supabase/service";

const supabaseAdmin = getServiceSupabase();

export async function saveCampaignMemory({
  organizationId,
  pageId,
  campaign,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const { error } =
    await supabaseAdmin
      .from("campaign_memory")
      .insert({
        organization_id: organizationId,
        page_id: pageId,
        campaign_id: campaign.id,
        campaign_type: campaign.campaign_type,
        mood: campaign.mood,
        lighting: campaign.lighting,
        composition: campaign.composition,
        atmosphere: campaign.atmosphere,
        prompt: campaign.prompt,
        image_url: campaign.image_url,
      });

  if (error) {
    throw error;
  }
}
