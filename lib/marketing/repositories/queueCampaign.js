import { getServiceSupabase } from "@/lib/shared/supabase/service";

const supabase = getServiceSupabase();

export async function queueCampaign(campaign) {
  const { data, error } = await supabase
    .from("marketing_campaigns")
    .insert(campaign)
    .select()
    .single();

  if (error) throw error;

  return data;
}
