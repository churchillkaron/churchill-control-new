import { supabase } from "@/lib/supabase";

export async function runExecutiveKPIs({
  tenantId,
}) {
  const { data: profitability } =
    await supabase
      .from(
        "profitability_snapshots"
      )
      .select("*")
      .eq("tenant_id", tenantId);

  const { data: inventory } =
    await supabase
      .from(
        "inventory_stock_ledger"
      )
      .select("*")
      .eq("tenant_id", tenantId);

  const { data: waste } =
    await supabase
      .from("waste_analysis")
      .select("*")
      .eq("tenant_id", tenantId);

  let revenue = 0;
  let cogs = 0;
  let labor = 0;
  let gross = 0;
  let net = 0;
  let inventoryValue = 0;
  let wasteValue = 0;

  for (const row of profitability || []) {
    revenue += Number(
      row.revenue || 0
    );

    cogs += Number(
      row.cogs || 0
    );

    labor += Number(
      row.labor_cost || 0
    );

    gross += Number(
      row.gross_profit || 0
    );

    net += Number(
      row.net_profit || 0
    );
  }

  for (const row of inventory || []) {
    inventoryValue += Number(
      row.inventory_value || 0
    );
  }

  for (const row of waste || []) {
    wasteValue += Number(
      row.waste_value || 0
    );
  }

  const margin =
    revenue > 0
      ? (net / revenue) * 100
      : 0;

  const { data, error } =
    await supabase
      .from(
        "executive_kpi_snapshots"
      )
      .insert({
        tenant_id: tenantId,
        total_revenue:
          revenue,
        total_cogs: cogs,
        total_labor: labor,
        gross_profit:
          gross,
        net_profit: net,
        net_margin: margin,
        inventory_value:
          inventoryValue,
        waste_value:
          wasteValue,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
