import { calculateVATLiability } from "./reporting/calculateVATLiability";
import { runVATClose } from "./reporting/runVATClose";
import { calculateTax } from "./reporting/calculateTax";
import { generateTaxReport } from "./reporting/generateTaxReport";

/**
 * FINANCE MODULE (SOURCE OF TRUTH)
 * No UI logic. Only accounting operations.
 */
export async function financeModule({
  organizationId,
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
