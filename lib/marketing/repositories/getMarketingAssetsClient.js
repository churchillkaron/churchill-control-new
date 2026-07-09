import { getServiceSupabase } from "@/lib/shared/supabase/service";

const supabase = getServiceSupabase();

export async function getMarketingAssets({
  organizationId,
  organizationId = null,
  assetType = null,
}) {
  let query =
    supabase
      .from("creative_assets")
      .select("*")
      .eq(
        "organization_id",
        organizationId || organizationId,
      )
      .order("score", {
        ascending: false,
      });

  if (assetType) {
    query =
      query.eq(
        "asset_type",
        assetType,
      );
  }

  const { data, error } =
    await query;

  if (error) throw error;

  return data || [];
}
