import { getServiceSupabase } from "@/lib/shared/supabase/service";

const supabaseAdmin = getServiceSupabase();

export async function saveCampaign(campaign) {

  console.log("SAVE CAMPAIGN INPUT:", campaign);

  const { data, error } = await supabaseAdmin
    .from("marketing_campaigns")
    .insert({
      tenant_id: campaign.tenant_id,
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
        thumbnail_url: campaign.thumbnail_url
      },
      created_by: campaign.created_by
    })
    .select()
    .single();

  console.log("SAVE CAMPAIGN DATA:", data);
  console.log("SAVE CAMPAIGN ERROR:", error);

  if (error) {
    throw error;
  }

  return data;
}
