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
    throw new Error("organizationId required for cash flow");
  }

  if (!entityId) {
    throw new Error("entityId required for cash flow");
  }

  if (!startDate || !endDate) {
    throw new Error("startDate and endDate required for cash flow");
  }

  if (String(startDate) > String(endDate)) {
    throw new Error("cash flow startDate must not exceed endDate");
  }
}

export async function generateCashflow({
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

  const { ledgerLines } = await loadLedgerAccountBalances({
    organizationId,
    entityId,
    startDate,
    endDate,
  });

  let inflow = 0;
  let outflow = 0;

  for (const line of ledgerLines) {
    if (line.classification !== "cash") {
      continue;
    }

    const movement =
      Number(line.debit || 0) -
      Number(line.credit || 0);

    if (movement > 0) {
      inflow += movement;
    } else if (movement < 0) {
      outflow += Math.abs(movement);
    }
  }

  return {
    basis: "posted_general_ledger_cash_accounts",
    method: "cash_account_movement",
    statutoryClassificationComplete: false,
    organizationId,
    entityId,
    inflow,
    outflow,
    netCashflow: inflow - outflow,
    startDate,
    endDate,
  };
}
