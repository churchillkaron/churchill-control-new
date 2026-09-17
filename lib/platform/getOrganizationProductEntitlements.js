function activeEntitlement(row) {
  const status = String(row?.status || "").trim().toLowerCase();
  if (status !== "active" && status !== "trial") return false;
  if (!row?.ends_at) return true;
  const endsAt = new Date(row.ends_at).getTime();
  return Number.isFinite(endsAt) ? endsAt > Date.now() : true;
}

export async function getOrganizationProductEntitlements({ organizationId, supabase } = {}) {
  if (!organizationId || !supabase) return [];

  const { data, error } = await supabase
    .from("organization_product_entitlements")
    .select("product_id, status, source, subscription_id, starts_at, ends_at, metadata")
    .eq("organization_id", organizationId)
    .in("status", ["active", "trial"])
    .order("product_id");

  if (error) {
    if (error.code !== "42P01") {
      console.error("organization_product_entitlements error:", error.message);
    }
    return [];
  }

  return (data || []).filter(activeEntitlement);
}
