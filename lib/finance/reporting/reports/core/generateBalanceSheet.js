import {
  loadLedgerAccountBalances,
} from "../loadLedgerAccountBalances";

export async function generateBalanceSheet({
  organizationId,
  entityId,
  endDate = null,
} = {}) {
  const { rows } = await loadLedgerAccountBalances({
    organizationId,
    entityId,
    startDate: null,
    endDate,
  });

  const totalAssets = rows
    .filter(row => ["asset", "cash"].includes(row.classification))
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalLiabilities = rows
    .filter(row => row.classification === "liability")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const contributedEquity = rows
    .filter(row => row.classification === "equity")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const currentEarnings = rows
    .filter(row => ["revenue", "cogs", "expense"].includes(row.classification))
    .reduce((sum, row) => {
      if (row.classification === "revenue") {
        return sum + Number(row.amount || 0);
      }

      return sum - Number(row.amount || 0);
    }, 0);

  return {
    totalAssets,
    totalLiabilities,
    totalEquity: contributedEquity + currentEarnings,
    contributedEquity,
    currentEarnings,
    endDate,
  };
}
