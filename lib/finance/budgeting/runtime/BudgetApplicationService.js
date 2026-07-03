import { createBudget } from "@/lib/finance/budgeting/repositories/BudgetRepository";

export async function createBudgetDocument({
  organizationId,
  category,
  amount,
  month,
  year,
  createdBy = "system",
}) {
  return await createBudget({
    organization_id: organizationId,
    category,
    amount,
    month,
    year,
    created_by: createdBy,
    created_at: new Date().toISOString(),
  });
}
