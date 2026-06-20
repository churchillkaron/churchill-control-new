import { runVATClose } from "../core/runVATClose";
import { generateTaxReport } from "../core/generateTaxReport";

/**
 * MONTHLY AUTOMATION
 */
export async function runMonthlyTaxClose({
  organizationId,
  tenantId,
  periodStart,
  periodEnd,
  vatPayableAccountId,
  vatReceivableAccountId,
  taxSettlementAccountId
}) {

  const vat = await runVATClose({
    organizationId,
    tenantId,
    filingPeriod: `${periodStart}_${periodEnd}`,
    startDate: periodStart,
    endDate: periodEnd,
    vatPayableAccountId,
    vatReceivableAccountId,
    taxSettlementAccountId
  });

  const report = await generateTaxReport({
    organizationId,
    tenantId,
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
