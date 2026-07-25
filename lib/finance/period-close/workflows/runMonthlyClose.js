import {
  closeAccountingPeriod,
} from "@/lib/finance/period-close/runtime/PeriodCloseExecutionService";

const DEFAULT_MONTH_END_STEPS = [
  "SUBLEDGER_RECONCILIATION",
  "BANK_RECONCILIATION",
  "DEPRECIATION",
  "FX_REVALUATION",
  "TAX_CLOSE",
];

export default async function runMonthlyClose({
  organizationId,
  entityId,
  periodId,
  requiredSteps = DEFAULT_MONTH_END_STEPS,
  closedBy = null,
  idempotencyKey,
}) {
  return closeAccountingPeriod({
    organizationId,
    entityId,
    periodId,
    closeType: "MONTH_END",
    requiredSteps,
    closedBy,
    idempotencyKey,
  });
}
