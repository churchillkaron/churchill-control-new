import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function generateBalanceSheet({
  organizationId,
  reportingPeriod,
}) {
  const inventory =
    await supabaseAdmin
      .from(
        "inventory_ledger"
      )
      .select("*")
      .eq("organization_id", organizationId);

  const cash =
    await supabaseAdmin
      .from(
        "cash_flow_snapshots"
      )
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", {
        ascending: false,
      })
      .limit(1)
      .single();

  const payables =
    await supabaseAdmin
      .from("purchase_orders")
      .select("*")
      .eq("organization_id", organizationId);

  const profitability =
    await supabaseAdmin
      .from(
        "profitability_snapshots"
      )
      .select("*")
      .eq("organization_id", organizationId);

  let inventoryAssets = 0;

  for (const row of inventory.data || []) {
    inventoryAssets += Number(
      row.inventory_value || 0
    );
  }

  const cashBalance =
    Number(
      cash.data
        ?.cash_position || 0
    );

  let liabilities = 0;

  for (const row of payables.data || []) {
    liabilities += Number(
      row.po_total || 0
    );
  }

  let retainedEarnings = 0;

  for (const row of profitability.data || []) {
    retainedEarnings += Number(
      row.net_profit || 0
    );
  }

  const assets =
    inventoryAssets +
    cashBalance;

  const equity =
    assets - liabilities;


  return {

    totalAssets:
      assets,

    totalLiabilities:
      liabilities,

    totalEquity:
      equity + retainedEarnings,

  };

}
