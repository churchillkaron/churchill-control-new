import { createServerSupabase } from "@/lib/shared/supabase/server";
import { getLedgerBalances } from "../general-ledger/getLedgerBalances";

export async function calculateVATLiability({
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

  let vatPayable = 0;
  let vatReceivable = 0;

  for (const account of balances) {
    const code =
      String(account.code || "");

    const balance =
      Math.abs(
        Number(account.balance || 0)
      );

    if (code === "2410") {
      vatPayable += balance;
    }

    if (code === "1410") {
      vatReceivable += balance;
    }
  }

  return {
    vatPayable,
    vatReceivable,
    netVAT:
      vatPayable -
      vatReceivable,
  };
}
