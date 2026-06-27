import { runMonthEndClose } from "./MonthEndCloseEngine";

/**
 * FINANCE CLOSE GATEWAY
 */

export async function financeCloseGateway(payload) {
  const {
    periodId,
    glEntries,
    subLedger
  } = payload;

  return await runMonthEndClose({
    periodId,
    glEntries,
    subLedger
  });
}
