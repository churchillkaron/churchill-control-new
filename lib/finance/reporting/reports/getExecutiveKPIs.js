import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getExecutiveKPIs({ organizationId, entityId = null } = {}) {
  if (!organizationId) throw new Error("organizationId required");

  let query = supabaseAdmin
    .from("general_ledger")
    .select(`
      debit,
      credit,
      entity_id,
      chart_of_accounts!fk_general_ledger_account (
        account_code,
        account_category,
        account_type
      )
    `)
    .eq("organization_id", organizationId);

  if (entityId) query = query.eq("entity_id", entityId);

  const { data: rows, error } = await query.limit(10000);
  if (error) throw error;

  let revenue = 0;
  let cogs = 0;
  let operatingExpenses = 0;
  let cash = 0;

  for (const row of rows || []) {
    const account = Array.isArray(row.chart_of_accounts)
      ? row.chart_of_accounts[0]
      : row.chart_of_accounts;
    const category = String(account?.account_category || account?.account_type || "").toUpperCase();
    const code = String(account?.account_code || "");
    const debit = Number(row.debit || 0);
    const credit = Number(row.credit || 0);

    if (category.includes("REVENUE") || category.includes("INCOME")) revenue += credit - debit;
    if (category.includes("COGS") || category.includes("COST_OF_SALES")) cogs += debit - credit;
    if (category.includes("EXPENSE") && !category.includes("COGS")) operatingExpenses += debit - credit;
    if (code.startsWith("100") || code.startsWith("101") || code.startsWith("110")) cash += debit - credit;
  }

  const grossProfit = revenue - cogs;
  const netOperatingResult = grossProfit - operatingExpenses;

  return {
    organization_id: organizationId,
    entity_id: entityId,
    revenue,
    cogs,
    gross_profit: grossProfit,
    operating_expenses: operatingExpenses,
    net_operating_result: netOperatingResult,
    gross_profit_margin: revenue ? (grossProfit / revenue) * 100 : 0,
    net_operating_margin: revenue ? (netOperatingResult / revenue) * 100 : 0,
    cash,
  };
}
