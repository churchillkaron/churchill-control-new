import { supabase } from "@/lib/supabase";

export async function runFinanceAnomalyDetection({
  tenantId,
}) {
  const anomalies = [];

  const profitability =
    await supabase
      .from(
        "profitability_snapshots"
      )
      .select("*")
      .eq("tenant_id", tenantId);

  for (const row of profitability.data || []) {
    const margin =
      Number(
        row.net_margin || 0
      );

    if (margin < 0) {
      anomalies.push({
        tenant_id: tenantId,
        anomaly_type:
          "NEGATIVE_MARGIN",
        severity: "high",
        reference_type:
          row.reference_type,
        reference_id:
          row.reference_id,
        anomaly_score: 95,
        anomaly_message:
          "Negative profitability detected",
      });
    }

    if (margin > 80) {
      anomalies.push({
        tenant_id: tenantId,
        anomaly_type:
          "UNUSUAL_MARGIN",
        severity: "medium",
        reference_type:
          row.reference_type,
        reference_id:
          row.reference_id,
        anomaly_score: 70,
        anomaly_message:
          "Unusually high margin detected",
      });
    }
  }

  if (anomalies.length === 0) {
    return [];
  }

  const { data, error } =
    await supabase
      .from(
        "finance_anomaly_detection"
      )
      .insert(anomalies)
      .select();

  if (error) {
    throw error;
  }

  return data;
}
