import { supabase }
from "@/lib/supabase";

export async function saveCampaign(
  campaign
) {

  const { data, error } =
    await supabase
      .from(
        "marketing_campaigns"
      )
      .insert(campaign)
      .select()
      .single();

  if (error) {

    throw error;
  }

  return data;
}