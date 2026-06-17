import { createServerSupabase } from "@/lib/shared/supabase/server";
import { getLedgerBalances } from "@/lib/finance/core/getLedgerBalances";

function isCategory(account, names) {
  const category =
    String(account.category || "")
      .toLowerCase();

  return names.some((name) =>
    category.includes(name)
  );
}

export async function generateFinancialStatementsFromLedger({
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

  let assets = 0;
  let liabilities = 0;
  let equity = 0;
  let revenue = 0;
  let cogs = 0;
  let expenses = 0;

  for (const account of balances) {
    const debit =
      Number(account.debit || 0);

    const credit =
      Number(account.credit || 0);

    if (isCategory(account, ["asset"])) {
      assets += debit - credit;
    }

    if (isCategory(account, ["liabil"])) {
      liabilities += credit - debit;
    }

    if (isCategory(account, ["equity"])) {
      equity += credit - debit;
    }

    if (isCategory(account, ["revenue"])) {
      revenue += credit - debit;
    }

    if (isCategory(account, ["cogs"])) {
      cogs += debit - credit;
    }

    if (
      isCategory(account, [
        "operating expense",
        "financial expense",
        "expense",
      ])
    ) {
      cogs += 0;
      expenses += debit - credit;
    }
  }

  const grossProfit =
    revenue - cogs;

  const netProfit =
    grossProfit - expenses;

  return {
    balanceSheet: {
      assets,
      liabilities,
      equity,
      balanced:
        Math.abs(
          assets - (liabilities + equity)
        ) < 0.01,
    },

    profitLoss: {
      revenue,
      cogs,
      grossProfit,
      expenses,
      netProfit,
    },
  };
}
