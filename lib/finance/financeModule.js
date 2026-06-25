import { calculateVATLiability } from "./reporting/calculateVATLiability";
import { runVATClose } from "./reporting/runVATClose";
import { calculateTax } from "./reporting/calculateTax";
import { generateTaxReport } from "./reporting/generateTaxReport";

/**
 * FINANCE MODULE (SOURCE OF TRUTH)
 * No UI logic. Only accounting operations.
 */
export async function financeModule({
  tenantId,
  organizationId,
  periodStart,
  periodEnd
}) {

  const vat = await calculateVATLiability({
    tenantId,
    startDate: periodStart,
    endDate: periodEnd
  });

  const report = await generateTaxReport({
    tenantId,
    periodStart,
    periodEnd
  });

  return {
    vat,
    report,
    status: {
      module: "finance",
      state: "ACTIVE"
    }
  };
}
