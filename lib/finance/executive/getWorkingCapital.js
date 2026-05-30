import { supabase } from "@/lib/supabase";

export async function getWorkingCapital({
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

  let currentAssets = 0;
  let currentLiabilities = 0;

  for (const line of data || []) {
    const type = line.chart_of_accounts?.type;

    const amount =
      Number(line.debit || 0) -
      Number(line.credit || 0);

    if (type === "asset") {
      currentAssets += amount;
    }

    if (type === "liability") {
      currentLiabilities += Math.abs(amount);
    }
  }

  return {
    currentAssets,
    currentLiabilities,
    workingCapital:
      currentAssets - currentLiabilities,
  };
}
