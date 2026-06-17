import { createServerSupabase } from "@/lib/shared/supabase/server";
import { getLedgerBalances } from "@/lib/finance/core/getLedgerBalances";

export async function getWorkingCapital({
  tenantId,
  startDate,
  endDate,
}) {
  const balances =
    await getLedgerBalances({
      tenantId,
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
    currentAssets,
    currentLiabilities,
    workingCapital:
      currentAssets -
      currentLiabilities,
  };
}
