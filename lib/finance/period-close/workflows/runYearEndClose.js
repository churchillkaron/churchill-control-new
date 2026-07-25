import {
  closeAccountingPeriod,
} from "@/lib/finance/period-close/runtime/PeriodCloseExecutionService";

const DEFAULT_YEAR_END_STEPS = [
  "SUBLEDGER_RECONCILIATION",
  "BANK_RECONCILIATION",
  "DEPRECIATION",
  "FX_REVALUATION",
  "TAX_CLOSE",
  "RETAINED_EARNINGS",
];

export default async function runYearEndClose({
  organizationId,
  entityId,
  periodId,
  requiredSteps = DEFAULT_YEAR_END_STEPS,
  closedBy = null,
  idempotencyKey,
}) {
  return closeAccountingPeriod({
    organizationId,
    entityId,
    periodId,
    closeType: "YEAR_END",
    requiredSteps,
    closedBy,
    idempotencyKey,
  });
}
