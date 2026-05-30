import { supabase } from "@/lib/supabase";

export async function generateFinancialStatements({
  tenantId,
  reportingPeriod,
}) {
  const profitability =
    await supabase
      .from(
        "profitability_snapshots"
      )
      .select("*")
      .eq("tenant_id", tenantId);

  let revenue = 0;
  let expenses = 0;

  for (const row of profitability.data || []) {
    revenue += Number(
      row.revenue || 0
    );

    expenses +=
      Number(row.cogs || 0) +
      Number(
        row.labor_cost || 0
      ) +
      Number(
        row.overhead_cost || 0
      );
  }

  const netIncome =
    revenue - expenses;

  const { data, error } =
    await supabase
      .from(
        "financial_statement_snapshots"
      )
      .insert({
        tenant_id: tenantId,
        statement_type:
          "INCOME_STATEMENT",
        reporting_period:
          reportingPeriod,
        total_revenue:
          revenue,
        total_expenses:
          expenses,
        net_income:
          netIncome,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
