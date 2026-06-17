import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runCashReconciliation({
  tenantId,
  bankBalance,
}) {
  const cash =
    await supabase
      .from(
        "cash_flow_snapshots"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", {
        ascending: false,
      })
      .limit(1)
      .single();

  const bookBalance =
    Number(
      cash.data
        ?.cash_position || 0
    );

  const variance =
    bookBalance -
    Number(bankBalance || 0);

  const status =
    Math.abs(variance) < 1
      ? "matched"
      : "variance";

  const { data, error } =
    await supabase
      .from(
        "cash_reconciliation_snapshots"
      )
      .insert({
        tenant_id: tenantId,
        cash_book_balance:
          bookBalance,
        bank_balance:
          bankBalance,
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

  return data;
}
