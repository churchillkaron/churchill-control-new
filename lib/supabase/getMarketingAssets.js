import { supabase }
from "@/lib/supabase";

export async function getMarketingAssets({

  tenantId,

  assetType = null,

}) {

  let query =
    supabase
      .from(
        "marketing_assets"
      )
      .select("*")
      .eq(
        "tenant_id",
        tenantId
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

  if (assetType) {

    query =
      query.eq(
        "asset_type",
        assetType
      );

  }

  const {
    data,
    error,
  } = await query;

  if (error) {

    throw error;

  }

  return data || [];

}