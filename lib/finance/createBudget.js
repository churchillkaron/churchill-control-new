import { supabase } from "@/lib/supabase";

export async function createBudget(data) {
  const { lines = [], ...budgetData } = data;

  const { data: budget, error } = await supabase
    .from("budgets")
    .insert(budgetData)
    .select()
    .single();

  if (error) {
    throw error;
  }

  if (lines.length > 0) {
    const budgetLines = lines.map((line) => ({
      budget_id: budget.id,
      tenant_id: budget.tenant_id,
      account_code: line.accountCode,
      account_name: line.accountName,
      monthly_amount: line.monthlyAmount,
    }));

    const { error: linesError } = await supabase
      .from("budget_lines")
      .insert(budgetLines);

    if (linesError) {
      throw linesError;
    }
  }

  return budget;
}
