import { getLedgerBalances } from "./getLedgerBalances";

export async function calculateRetainedEarnings({
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

  let revenue = 0;
  let expenses = 0;

  for (const account of balances) {
    const value =
      Math.abs(
        Number(account.balance || 0)
      );

    if (account.type === "revenue") {
      revenue += value;
    }

    if (account.type === "expense") {
      expenses += value;
    }
  }

  return revenue - expenses;
}
