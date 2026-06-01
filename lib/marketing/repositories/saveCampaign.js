import { supabase }
from "@/lib/shared/supabase/client";

export async function saveCampaign(
  campaign
) {

  console.log(
    "SAVE CAMPAIGN INPUT:",
    campaign
  );

  const { data, error } =
    await supabase
      .from(
        "marketing_campaigns"
      )
      .insert(campaign)
      .select()
      .single();

  console.log(
    "SAVE CAMPAIGN DATA:",
    data
  );

  console.log(
    "SAVE CAMPAIGN ERROR:",
    error
  );

  if (error) {

    throw error;
  }

  return data;
}