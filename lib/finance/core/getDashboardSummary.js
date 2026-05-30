import { supabase } from "@/lib/supabase";

export async function getDashboardSummary({
  tenantId,
}) {
  const { data: kpis } =
    await supabase
      .from(
        "accounting_kpi_snapshots"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", {
        ascending: false,
      })
      .limit(1);

  const { data: alerts } =
    await supabase
      .from("accounting_alerts")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "open");

  const { data: approvals } =
    await supabase
      .from(
        "accounting_approval_workflows"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "pending");

  return {
    latestKPI:
      kpis?.[0] || null,
    openAlerts:
      alerts?.length || 0,
    pendingApprovals:
      approvals?.length || 0,
    alerts:
      alerts || [],
  };
}
