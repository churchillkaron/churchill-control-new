import { getServiceSupabase } from "@/lib/shared/supabase/service";

const supabaseAdmin = getServiceSupabase();

export async function getMarketingAssets({
  organizationId,
  assetType = null,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  let query =
    supabaseAdmin
      .from("creative_assets")
      .select("*")
      .eq("organization_id", organizationId)
      .order("score", {
        ascending: false,
      });

  if (assetType) {
    query = query.eq("asset_type", assetType);
  }

  const { data, error } =
    await query;

  if (error) {
    throw error;
  }

  return data || [];
}
