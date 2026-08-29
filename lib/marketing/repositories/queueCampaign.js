import { supabase } from "@/lib/shared/supabase/client";

export async function queueCampaign(campaign) {
  const { data, error } = await supabase
    .from("marketing_campaigns")
    .insert(campaign)
    .select()
    .single();

  if (error) throw error;

  return data;
}
