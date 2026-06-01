import { supabase }
from "@/lib/shared/supabase/client";

export async function updateCampaignStatus({

  campaignId,

  status,
}) {

  const { data, error } =
    await supabase
      .from(
        "marketing_campaigns"
      )
      .update({
        status,
      })
      .eq("id", campaignId)
      .select()
      .single();

  if (error) {

    throw error;
  }

  return data;
}