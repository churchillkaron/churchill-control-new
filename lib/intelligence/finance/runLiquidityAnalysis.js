import { supabase } from "@/lib/supabase";

export async function runLiquidityAnalysis({
  tenantId,
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

  const payables =
    await supabase
      .from("purchase_orders")
      .select("po_total")
      .eq("tenant_id", tenantId);

  let liabilities = 0;

  for (const row of payables.data || []) {
    liabilities += Number(
      row.po_total || 0
    );
  }

  const available =
    Number(
      cash.data
        ?.cash_position || 0
    );

  const ratio =
    liabilities > 0
      ? available / liabilities
      : 999;

  let status = "healthy";

  if (ratio < 1) {
    status = "warning";
  }

  if (ratio < 0.5) {
    status = "critical";
  }

  const { data, error } =
    await supabase
      .from(
        "treasury_liquidity_analysis"
      )
      .insert({
        tenant_id: tenantId,
        available_cash:
          available,
        short_term_liabilities:
          liabilities,
        liquidity_ratio:
          ratio,
        liquidity_status:
          status,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
