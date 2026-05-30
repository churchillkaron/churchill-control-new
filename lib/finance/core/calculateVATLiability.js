import { getLedgerBalances } from "./getLedgerBalances";

export async function calculateVATLiability({
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

  let vatPayable = 0;
  let vatReceivable = 0;

  for (const account of balances) {
    const code =
      String(account.code || "");

    const balance =
      Math.abs(
        Number(account.balance || 0)
      );

    if (
      code.includes("2100")
    ) {
      vatPayable += balance;
    }

    if (
      code.includes("1150")
    ) {
      vatReceivable += balance;
    }
  }

  return {
    vatPayable,
    vatReceivable,
    netVAT:
      vatPayable -
      vatReceivable,
  };
}
