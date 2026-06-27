import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function generateBalanceSheet({
  organizationId,
  reportingPeriod,
}) {
  const inventory =
    await supabase
      .from(
        "inventory_ledger"
      )
      .select("*")
      .eq("organization_id", organizationId);

  const cash =
    await supabase
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
    await supabase
      .from("purchase_orders")
      .select("*")
      .eq("organization_id", organizationId);

  const profitability =
    await supabase
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

  const { data, error } =
    await supabase
      .from(
        "balance_sheet_snapshots"
      )
      .insert({
        organization_id: organizationId,
        reporting_period:
          reportingPeriod,
        total_assets:
          assets,
        total_liabilities:
          liabilities,
        total_equity:
          equity +
          retainedEarnings,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
