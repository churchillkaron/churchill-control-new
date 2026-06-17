import { createServerSupabase } from "@/lib/shared/supabase/server";
import { getLedgerBalances } from "./getLedgerBalances";

function isCategory(account, names) {
  const category =
    String(account.category || "")
      .toLowerCase();

  return names.some((name) =>
    category.includes(name)
  );
}

export async function calculateRetainedEarnings({
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

  let revenue = 0;
  let cogs = 0;
  let expenses = 0;

  for (const account of balances) {
    const debit =
      Number(account.debit || 0);

    const credit =
      Number(account.credit || 0);

    if (
      isCategory(account, [
        "revenue",
      ])
    ) {
      revenue +=
        credit - debit;
    }

    if (
      isCategory(account, [
        "cogs",
      ])
    ) {
      cogs +=
        debit - credit;
    }

    if (
      isCategory(account, [
        "operating expense",
        "financial expense",
        "expense",
      ])
    ) {
      expenses +=
        debit - credit;
    }
  }

  return (
    revenue -
    cogs -
    expenses
  );
}
