import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function createBudget({
  tenantId,
  budgetName,
  fiscalYear,
  lines,
}) {
  const {
    data: budget,
    error: budgetError,
  } = await supabase
    .from("budgets")
    .insert({
      tenant_id: tenantId,
      budget_name: budgetName,
      fiscal_year: fiscalYear,
      status: "active",
    })
    .select()
    .single();

  if (budgetError) {
    throw budgetError;
  }

  const budgetLines =
    lines.map((line) => ({
      tenant_id: tenantId,
      budget_id: budget.id,
      account_id:
        line.accountId,
      monthly_amount:
        Number(
          line.monthlyAmount || 0
        ),
      annual_amount:
        Number(
          line.annualAmount || 0
        ),
    }));

  const {
    data: insertedLines,
    error: lineError,
  } = await supabase
    .from("budget_lines")
    .insert(budgetLines)
    .select();

  if (lineError) {
    throw lineError;
  }

  return {
    budget,
    lines: insertedLines,
  };
}
