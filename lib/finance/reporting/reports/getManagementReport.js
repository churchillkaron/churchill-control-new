import { generateProfitAndLoss } from "./generateProfitAndLoss";
import { generateBalanceSheet } from "./core/generateBalanceSheet";
import { generateCashflow } from "./generateCashflow";
import { calculateBudgetVariance } from "@/lib/finance/budgeting/capabilities/calculateBudgetVariance";

export async function getManagementReport({
  organizationId,
  entityId,
  startDate,
  endDate,
  budgets = [],
  actuals = [],
}) {
  if (!organizationId) {
    throw new Error("organizationId required for management report");
  }
  if (!entityId) {
    throw new Error("entityId required for management report");
  }
  if (!startDate || !endDate) {
    throw new Error("startDate and endDate required for management report");
  }

  const [profitAndLoss, balanceSheet, cashFlow] = await Promise.all([
    generateProfitAndLoss({
      organizationId,
      entityId,
      startDate,
      endDate,
    }),
    generateBalanceSheet({
      organizationId,
      entityId,
      endDate,
    }),
    generateCashflow({
      organizationId,
      entityId,
      startDate,
      endDate,
    }),
  ]);

  return {
    basis: "posted_general_ledger",
    organizationId,
    entityId,
    period: {
      startDate,
      endDate,
    },
    statements: {
      profitAndLoss,
      balanceSheet,
      cashFlow,
    },
    budgetVsActual: calculateBudgetVariance({
      budgets,
      actuals,
    }),
    validation: {
      balanceSheetBalanced: balanceSheet.balanced,
      trialPeriodValid: String(startDate) <= String(endDate),
    },
  };
}
