import { supabase } from "@/lib/supabase";

export async function runExecutiveAlerts({
  tenantId,
}) {
  const alerts = [];

  const { data: waste } =
    await supabase
      .from("waste_analysis")
      .select("*")
      .eq("tenant_id", tenantId);

  const totalWaste =
    (waste || []).reduce(
      (sum, row) =>
        sum +
        Number(
          row.waste_value || 0
        ),
      0
    );

  if (totalWaste > 10000) {
    alerts.push({
      tenant_id: tenantId,
      alert_type:
        "HIGH_WASTE",
      severity: "high",
      alert_message:
        "Waste exceeds threshold",
    });
  }

  const { data: profitability } =
    await supabase
      .from(
        "profitability_snapshots"
      )
      .select("*")
      .eq("tenant_id", tenantId);

  const negative =
    (profitability || []).filter(
      (p) =>
        Number(
          p.net_profit || 0
        ) < 0
    );

  if (negative.length > 0) {
    alerts.push({
      tenant_id: tenantId,
      alert_type:
        "NEGATIVE_PROFITABILITY",
      severity: "critical",
      alert_message:
        "Negative profitability detected",
    });
  }

  if (alerts.length === 0) {
    return [];
  }

  const { data, error } =
    await supabase
      .from("executive_alerts")
      .insert(alerts)
      .select();

  if (error) {
    throw error;
  }

  return data;
}
