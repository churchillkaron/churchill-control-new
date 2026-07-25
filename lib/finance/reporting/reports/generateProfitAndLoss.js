import {
  loadLedgerAccountBalances,
} from "./loadLedgerAccountBalances";

export async function generateProfitAndLoss({
  organizationId,
  entityId,
  startDate = null,
  endDate = null,
} = {}) {
  const { rows } = await loadLedgerAccountBalances({
    organizationId,
    entityId,
    startDate,
    endDate,
  });

  const revenue = rows
    .filter(row => row.classification === "revenue")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const cogs = rows
    .filter(row => row.classification === "cogs")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const expenses = rows
    .filter(row => row.classification === "expense")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - expenses;

  return {
    revenue,
    cogs,
    grossProfit,
    expenses,
    netProfit,
    startDate,
    endDate,
  };
}
