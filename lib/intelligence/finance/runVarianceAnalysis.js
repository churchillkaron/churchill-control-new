import { supabase } from "@/lib/supabase";

export async function runVarianceAnalysis({
  tenantId,
  varianceType,
  referenceId,
  expectedAmount,
  actualAmount,
}) {
  const variance =
    Number(actualAmount || 0) -
    Number(expectedAmount || 0);

  const percentage =
    expectedAmount > 0
      ? (
          variance /
          Number(expectedAmount)
        ) * 100
      : 0;

  const { data, error } =
    await supabase
      .from(
        "operational_variances"
      )
      .insert({
        tenant_id: tenantId,
        variance_type:
          varianceType,
        reference_id:
          referenceId,
        expected_amount:
          expectedAmount,
        actual_amount:
          actualAmount,
        variance_amount:
          variance,
        variance_percentage:
          percentage,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
