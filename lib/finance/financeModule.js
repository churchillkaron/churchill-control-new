import { calculateVATLiability } from "./tax/capabilities/calculateVATLiability";
import { runVATClose } from "./tax/workflows/runVATClose";
import { calculateTax } from "./tax/capabilities/calculateTax";
import { generateTaxReport } from "./tax/reports/generateTaxReport";

/**
 * FINANCE MODULE (SOURCE OF TRUTH)
 * No UI logic. Only accounting operations.
 */
export async function financeModule({
  organizationId,
  periodStart,
  periodEnd
}) {

  const vat = await calculateVATLiability({
    organizationId,
    startDate: periodStart,
    endDate: periodEnd
  });

  const report = await generateTaxReport({
    organizationId,
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
