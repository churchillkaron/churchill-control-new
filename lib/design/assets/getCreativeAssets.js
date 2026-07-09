import { createServerSupabase } from "@/lib/shared/supabase/server";

export async function getCreativeAssets({
  tenantId = null,
  organizationId = null,
  assetType = null,
} = {}) {
  const supabase = createServerSupabase();

  let query =
    supabase
      .from("creative_assets")
      .select("*")
      .order("created_at", { ascending: false });

  const resolvedOrganizationId =
    organizationId || tenantId;

  if (resolvedOrganizationId) {
    query =
      query.eq(
        "organization_id",
        resolvedOrganizationId,
      );
  }

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
