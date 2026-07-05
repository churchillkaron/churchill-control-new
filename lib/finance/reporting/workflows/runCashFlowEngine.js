import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function runCashFlowEngine({
  organizationId,
}) {
  const revenue =
    await supabaseAdmin
      .from(
        "profitability_snapshots"
      )
      .select("revenue")
      .eq("organization_id", organizationId);

  const procurement =
    await supabaseAdmin
      .from("purchase_orders")
      .select("po_total")
      .eq("organization_id", organizationId);

  let inflow = 0;
  let outflow = 0;

  for (const row of revenue.data || []) {
    inflow += Number(
      row.revenue || 0
    );
  }

  for (const row of procurement.data || []) {
    outflow += Number(
      row.po_total || 0
    );
  }

  const net =
    inflow - outflow;

  const { data, error } =
    await supabaseAdmin
      .from("cash_flow_snapshots")
      .insert({
        organization_id: organizationId,
        inflow,
        outflow,
        net_cash_flow: net,
        cash_position: net,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
