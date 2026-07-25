import {
  loadLedgerAccountBalances,
} from "./loadLedgerAccountBalances";

export async function generateCashflow({
  organizationId,
  entityId,
  startDate = null,
  endDate = null,
} = {}) {
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
    inflow,
    outflow,
    netCashflow: inflow - outflow,
    startDate,
    endDate,
  };
}
