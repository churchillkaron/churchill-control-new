import { supabase }
from "@/lib/supabase";

export async function getTopPerformingCampaigns({

  tenantId,

  limit = 5,

}) {

  const { data, error } =
    await supabase
      .from(
        "marketing_campaigns"
      )
      .select("*")
      .eq(
        "tenant_id",
        tenantId
      )
      .not(
        "analytics",
        "is",
        null
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .limit(limit);

  if (error) {

    console.error(error);

    return [];

  }

  return data || [];

}