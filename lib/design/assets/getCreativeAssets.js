import { createServerSupabase } from "@/lib/shared/supabase/server";

export async function getCreativeAssets({
  tenantId,
  organizationId = null,
}) {
  const supabase = createServerSupabase();

  let query = supabase
    .from("creative_assets")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (organizationId) {
    query = query.eq(
      "organization_id",
      organizationId
    );
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}
