import {
  loadLedgerAccountBalances,
} from "./loadLedgerAccountBalances";

function requireScope({
  organizationId,
  entityId,
  startDate,
  endDate,
}) {
  if (!organizationId) {
    throw new Error("organizationId required for profit and loss");
  }

  if (!entityId) {
    throw new Error("entityId required for profit and loss");
  }

  if (!startDate || !endDate) {
    throw new Error("startDate and endDate required for profit and loss");
  }

  if (String(startDate) > String(endDate)) {
    throw new Error("profit and loss startDate must not exceed endDate");
  }
}

export async function generateProfitAndLoss({
  organizationId,
  entityId,
  startDate = null,
  endDate = null,
} = {}) {
  requireScope({
    organizationId,
    entityId,
    startDate,
    endDate,
  });

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
    basis: "posted_general_ledger",
    organizationId,
    entityId,
    revenue,
    cogs,
    grossProfit,
    expenses,
    netProfit,
    startDate,
    endDate,
  };
}
