import { getServiceSupabase } from "@/lib/shared/supabase/service";

const supabaseAdmin = getServiceSupabase();

export async function saveCampaign(campaign) {
  if (!campaign.organization_id && !campaign.organizationId) {
    throw new Error("organization_id required");
  }

  const organizationId =
    campaign.organization_id ||
    campaign.organizationId;

  const { data, error } =
    await supabaseAdmin
      .from("marketing_campaigns")
      .insert({
        organization_id: organizationId,
        campaign_name: campaign.title,
        campaign_type: campaign.campaign_type,
        campaign_status: campaign.status || "ready",
        campaign_content: {
          title: campaign.title,
          subtitle: campaign.subtitle,
          content: campaign.content,
          mood: campaign.mood,
          lighting: campaign.lighting,
          composition: campaign.composition,
          atmosphere: campaign.atmosphere,
          venue: campaign.venue,
          subject: campaign.subject,
          dna: campaign.dna,
          engine_confidence: campaign.engine_confidence,
          prompt: campaign.prompt,
          selected_assets: campaign.selected_assets,
          image_url: campaign.image_url,
          thumbnail_url: campaign.thumbnail_url,
        },
        created_by: campaign.created_by,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
