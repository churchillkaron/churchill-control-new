/**
 * CASHFLOW PREDICTION ENGINE (LEVEL 5 CORE)
 */

export function predictCashflow(glHistory = []) {
  const last30 = glHistory.slice(-30);

  const inflow = last30
    .filter(x => x.type === "REVENUE")
    .reduce((s, x) => s + x.amount, 0);

  const outflow = last30
    .filter(x => x.type === "EXPENSE")
    .reduce((s, x) => s + x.amount, 0);

  return {
    projectedNet: inflow - outflow,
    trend: inflow > outflow ? "POSITIVE" : "NEGATIVE"
  };
}
