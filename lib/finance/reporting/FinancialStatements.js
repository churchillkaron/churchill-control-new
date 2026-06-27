/**
 * FINANCIAL STATEMENTS ENGINE (ACCOUNTING FIRM GRADE)
 * Derived ONLY from GL (never from AR/AP directly)
 */

export function generateProfitAndLoss(glEntries = []) {
  let revenue = 0;
  let expenses = 0;

  for (const e of glEntries) {
    if (e.type === "REVENUE") revenue += e.amount;
    if (e.type === "EXPENSE") expenses += e.amount;
  }

  return {
    revenue,
    expenses,
    net_profit: revenue - expenses
  };
}

export function generateBalanceSheet(glEntries = []) {
  let assets = 0;
  let liabilities = 0;
  let equity = 0;

  for (const e of glEntries) {
    if (e.category === "ASSET") assets += e.amount;
    if (e.category === "LIABILITY") liabilities += e.amount;
    if (e.category === "EQUITY") equity += e.amount;
  }

  return {
    assets,
    liabilities,
    equity,
    balanced: assets === liabilities + equity
  };
}
