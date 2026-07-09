import { runVATClose } from "./runVATClose";
import { generateTaxReport } from "../reports/generateTaxReport";

/**
 * MONTHLY AUTOMATION
 */
export async function runMonthlyTaxClose({
  organizationId,
  periodStart,
  periodEnd,
  vatPayableAccountId,
  vatReceivableAccountId,
  taxSettlementAccountId,
}) {

  const vat = await runVATClose({
    organizationId,
    filingPeriod: `${periodStart}_${periodEnd}`,
    startDate: periodStart,
    endDate: periodEnd,
    vatPayableAccountId,
    vatReceivableAccountId,
    taxSettlementAccountId,
  });

  const report = await generateTaxReport({
    organizationId,
    periodStart,
    periodEnd,
    reportType: "MONTHLY_CLOSE",
  });

  return {
    success: true,
    vat,
    report,
  };
}
