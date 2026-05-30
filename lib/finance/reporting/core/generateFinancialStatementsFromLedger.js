import { getLedgerBalances } from "./getLedgerBalances";

export async function generateFinancialStatementsFromLedger({
  tenantId,
  startDate,
  endDate,
}) {
  const balances = await getLedgerBalances({
    tenantId,
    startDate,
    endDate,
  });

  let assets = 0;
  let liabilities = 0;
  let equity = 0;
  let revenue = 0;
  let expenses = 0;

  for (const account of balances) {
    const value = Number(account.balance || 0);

    if (account.type === "asset") {
      assets += value;
    }

    if (account.type === "liability") {
      liabilities += Math.abs(value);
    }

    if (account.type === "equity") {
      equity += Math.abs(value);
    }

    if (account.type === "revenue") {
      revenue += Math.abs(value);
    }

    if (account.type === "expense") {
      expenses += Math.abs(value);
    }
  }

  return {
    balanceSheet: {
      assets,
      liabilities,
      equity,
    },

    profitLoss: {
      revenue,
      expenses,
      netProfit: revenue - expenses,
    },
  };
}
