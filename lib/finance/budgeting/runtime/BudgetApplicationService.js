import {
  createBudget,
  listBudgets,
} from "../repositories/BudgetRepository";
import { loadLedgerAccountBalances } from "@/lib/finance/reporting/reports/loadLedgerAccountBalances";

export async function createBudgetDocument(input) {
  return createBudget(input);
}

export async function listBudgetsCommand(input) {
  const data = await listBudgets(input);
  return { success: true, data };
}

export async function calculateBudgetVarianceCommand({
  organizationId,
  entityId,
  periodId,
  startDate = null,
  endDate = null,
}) {
  const budgets = await listBudgets({
    organizationId,
    entityId,
    periodId,
  });

  const ledger = await loadLedgerAccountBalances({
    organizationId,
    entityId,
    startDate,
    endDate,
  });
  const actualByAccount = new Map(
    (ledger.rows || []).map(row => [String(row.account_id), Number(row.amount || 0)])
  );

  const rows = budgets.map(budget => {
    const budgetAmount = Number(budget.amount || 0);
    const actualAmount = Number(actualByAccount.get(String(budget.account_id)) || 0);
    const variance = actualAmount - budgetAmount;
    return {
      id: budget.id,
      period_id: budget.period_id,
      account_id: budget.account_id,
      account_code: budget.account_code,
      account_name: budget.account_name,
      category: budget.account_category || budget.category,
      currency_code: budget.currency_code,
      budget: Number(budgetAmount.toFixed(2)),
      actual: Number(actualAmount.toFixed(2)),
      variance: Number(variance.toFixed(2)),
      variance_percent: budgetAmount !== 0
        ? Number(((variance / budgetAmount) * 100).toFixed(2))
        : 0,
    };
  });

  return {
    success: true,
    rows,
    totals: rows.reduce(
      (totals, row) => ({
        budget: totals.budget + row.budget,
        actual: totals.actual + row.actual,
        variance: totals.variance + row.variance,
      }),
      { budget: 0, actual: 0, variance: 0 }
    ),
  };
}
