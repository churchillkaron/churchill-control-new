import { supabase } from "@/lib/supabase";

export async function getLiquidityMetrics({
  tenantId,
}) {
  const { data } = await supabase
    .from("journal_entry_lines")
    .select(`
      debit,
      credit,
      chart_of_accounts (
        type
      )
    `)
    .eq("tenant_id", tenantId);

  let assets = 0;
  let liabilities = 0;

  for (const line of data || []) {
    const type = line.chart_of_accounts?.type;

    const value =
      Number(line.debit || 0) -
      Number(line.credit || 0);

    if (type === "asset") {
      assets += value;
    }

    if (type === "liability") {
      liabilities += Math.abs(value);
    }
  }

  return {
    currentRatio:
      liabilities > 0
        ? assets / liabilities
        : assets,
    totalAssets: assets,
    totalLiabilities: liabilities,
  };
}
