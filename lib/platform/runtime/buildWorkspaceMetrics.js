import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function buildWorkspaceMetrics({
  organizationId,
} = {}) {
  if (!organizationId) {
    return {};
  }

  const [
    orders,
    revenue,
    inventoryAlerts,
    staff,
  ] = await Promise.all([
    supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),

    supabaseAdmin
      .from("orders")
      .select("total")
      .eq("organization_id", organizationId),

    supabaseAdmin
      .from("inventory_alerts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),

    supabaseAdmin
      .from("staff_accounts")
      .select("id", { count: "exact", head: true })
      .eq("active_organization_id", organizationId),
  ]);

  const revenueValue =
    (revenue.data || []).reduce(
      (sum, row) =>
        sum + Number(row.total || 0),
      0
    );

  return {
    orders: {
      value: orders.count || 0,
    },
    revenue: {
      value: revenueValue,
    },
    inventoryAlerts: {
      value: inventoryAlerts.count || 0,
    },
    staff: {
      value: staff.count || 0,
    },
  };
}
