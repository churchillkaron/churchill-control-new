import {
  loadLedgerAccountBalances,
} from "../loadLedgerAccountBalances";

function requireScope({ organizationId, entityId, endDate }) {
  if (!organizationId) {
    throw new Error("organizationId required for balance sheet");
  }

  if (!entityId) {
    throw new Error("entityId required for balance sheet");
  }

  if (!endDate) {
    throw new Error("endDate required for balance sheet");
  }
}

export async function generateBalanceSheet({
  organizationId,
  entityId,
  endDate = null,
} = {}) {
  requireScope({ organizationId, entityId, endDate });

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
  const totalEquity = contributedEquity + currentEarnings;
  const balanceDifference = totalAssets - totalLiabilities - totalEquity;
  const balanced = Math.abs(balanceDifference) <= 0.005;

  if (!balanced) {
    throw new Error(
      `Balance sheet does not balance for entity ${entityId}: difference ${balanceDifference.toFixed(2)}`
    );
  }

  return {
    basis: "posted_general_ledger",
    organizationId,
    entityId,
    totalAssets,
    totalLiabilities,
    totalEquity,
    contributedEquity,
    currentEarnings,
    balanceDifference,
    balanced,
    endDate,
  };
}
