/**
 * MONTH-END CLOSE ENGINE
 * Accounting-firm grade period closure
 */

import { lockPeriod } from "../period/PeriodLock";
import { reconcileGL } from "../audit/GLReconciliationEngine";
import {
  generateProfitAndLoss,
  generateBalanceSheet
} from "../reporting/FinancialStatements";

export async function runMonthEndClose({
  periodId,
  glEntries = [],
  subLedger = []
}) {

  // 🔒 1. RECONCILIATION CHECK
  const reconciliation = reconcileGL({
    glEntries,
    subLedger
  });

  if (reconciliation.status !== "OK") {
    throw new Error(
      `MONTH CLOSE BLOCKED: GL mismatch ${reconciliation.difference}`
    );
  }

  // 📊 2. FINAL REPORTS
  const pnl = generateProfitAndLoss(glEntries);
  const balanceSheet = generateBalanceSheet(glEntries);

  // 🔒 3. LOCK PERIOD
  lockPeriod(periodId);

  return {
    status: "CLOSED",
    periodId,
    pnl,
    balanceSheet,
    reconciliation
  };
}
