import { runVATClose } from "../core/runVATClose";
import { generateTaxReport } from "../core/generateTaxReport";

/**
 * MONTHLY AUTOMATION
 */
export async function runMonthlyTaxClose({
  organizationId,
  organizationId,
  periodStart,
  periodEnd,
  vatPayableAccountId,
  vatReceivableAccountId,
  taxSettlementAccountId
}) {

  const vat = await runVATClose({
    organizationId,
    organizationId,
    filingPeriod: `${periodStart}_${periodEnd}`,
    startDate: periodStart,
    endDate: periodEnd,
    vatPayableAccountId,
    vatReceivableAccountId,
    taxSettlementAccountId
  });

  const report = await generateTaxReport({
    organizationId,
    organizationId,
    periodStart,
    periodEnd,
    reportType: "MONTHLY_CLOSE"
  });

  return {
    success: true,
    vat,
    report
  };
}
