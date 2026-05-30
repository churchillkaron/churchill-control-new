import { supabase } from "@/lib/supabase";

export async function runAccountingAlerts({
  tenantId,
}) {
  const alerts = [];

  const { data: reconciliations } =
    await supabase
      .from(
        "accounting_control_totals"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .eq(
        "status",
        "out_of_balance"
      );

  for (const item of reconciliations || []) {
    alerts.push({
      tenant_id: tenantId,
      alert_type:
        "reconciliation",
      severity: "high",
      title:
        "Subledger Out of Balance",
      message:
        `${item.control_type} variance detected`,
    });
  }

  const { data: workflows } =
    await supabase
      .from(
        "accounting_approval_workflows"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "pending");

  for (const item of workflows || []) {
    alerts.push({
      tenant_id: tenantId,
      alert_type:
        "approval",
      severity: "medium",
      title:
        "Pending Approval Workflow",
      message:
        `${item.entity_type} awaiting approval`,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      tenant_id: tenantId,
      alert_type: "system",
      severity: "info",
      title:
        "Accounting System Healthy",
      message:
        "No accounting issues detected",
    });
  }

  const { data, error } =
    await supabase
      .from("accounting_alerts")
      .insert(alerts)
      .select();

  if (error) {
    throw error;
  }

  return data;
}
