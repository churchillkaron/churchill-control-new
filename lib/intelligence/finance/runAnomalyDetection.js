import { supabase } from "@/lib/supabase";

export async function runAnomalyDetection({
  tenantId,
}) {
  const anomalies = [];

  const { data: variances } =
    await supabase
      .from("operational_variances")
      .select("*")
      .eq("tenant_id", tenantId);

  for (const row of variances || []) {
    const variance =
      Math.abs(
        Number(
          row.variance_percentage || 0
        )
      );

    if (variance > 25) {
      anomalies.push({
        tenant_id: tenantId,
        anomaly_type:
          row.variance_type,
        severity:
          variance > 50
            ? "high"
            : "medium",
        reference_id:
          row.reference_id,
        expected_value:
          row.expected_amount,
        actual_value:
          row.actual_amount,
        variance:
          row.variance_amount,
        notes:
          "Operational variance anomaly detected",
      });
    }
  }

  if (anomalies.length === 0) {
    return [];
  }

  const { data, error } =
    await supabase
      .from(
        "accounting_anomalies"
      )
      .insert(anomalies)
      .select();

  if (error) {
    throw error;
  }

  return data;
}
