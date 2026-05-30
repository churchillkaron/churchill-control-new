import { supabase } from "@/lib/supabase";

export async function runIntercompanyReconciliation({
  tenantId,
  transactionId,
  sourceBalance,
  targetBalance,
}) {
  const variance =
    Number(sourceBalance || 0) -
    Number(targetBalance || 0);

  const status =
    Math.abs(variance) < 1
      ? "matched"
      : "variance";

  const { data, error } =
    await supabase
      .from(
        "intercompany_reconciliations"
      )
      .insert({
        tenant_id: tenantId,
        transaction_id:
          transactionId,
        source_balance:
          sourceBalance,
        target_balance:
          targetBalance,
        variance_amount:
          variance,
        reconciliation_status:
          status,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  await supabase
    .from(
      "intercompany_transactions"
    )
    .update({
      reconciliation_status:
        status,
    })
    .eq("id", transactionId);

  return data;
}
