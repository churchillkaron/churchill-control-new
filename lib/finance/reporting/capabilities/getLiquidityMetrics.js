import { createServerSupabase } from "@/lib/shared/supabase/server";
import { getLedgerBalances } from "@/lib/finance/general-ledger/getLedgerBalances";

export async function getLiquidityMetrics({
  organizationId,
  startDate,
  endDate,
}) {
  const balances =
    await getLedgerBalances({
      organizationId,
      startDate,
      endDate,
    });

  let currentAssets = 0;
  let currentLiabilities = 0;

  for (const account of balances) {
    const category =
      String(
        account.category || ""
      ).toLowerCase();

    const balance =
      Math.abs(
        Number(
          account.balance || 0
        )
      );

    if (
      category.includes(
        "asset"
      )
    ) {
      currentAssets +=
        balance;
    }

    if (
      category.includes(
        "liabil"
      )
    ) {
      currentLiabilities +=
        balance;
    }
  }

  return {
    currentRatio:
      currentLiabilities > 0
        ? currentAssets /
          currentLiabilities
        : 0,

    totalAssets:
      currentAssets,

    totalLiabilities:
      currentLiabilities,
  };
}
