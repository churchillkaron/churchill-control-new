import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getGeneralLedger({
  organizationId,
  entityId,
  accountId = null,
  startDate = null,
  endDate = null,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!entityId) throw new Error("entityId required");

  const pageSize = 1000;
  const data = [];

  for (let from = 0; ; from += pageSize) {
    let query = supabaseAdmin
      .from("general_ledger")
      .select(`
        *,
        chart_of_accounts!fk_general_ledger_account (
          id,
          account_code,
          account_name,
          account_category,
          account_type,
          normal_balance
        )
      `)
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId);

    if (accountId) query = query.eq("account_id", accountId);
    if (startDate) query = query.gte("posting_date", startDate);
    if (endDate) query = query.lte("posting_date", endDate);

    const page = await query
      .order("posting_date", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (page.error) throw page.error;
    const rows = page.data || [];
    data.push(...rows);
    if (rows.length < pageSize) break;
  }

  return data.map(row => ({
    ...row,
    account_code: row.chart_of_accounts?.account_code ?? null,
    account_name: row.chart_of_accounts?.account_name ?? null,
    account_category: row.chart_of_accounts?.account_category ?? null,
    account_type: row.chart_of_accounts?.account_type ?? null,
    normal_balance: row.chart_of_accounts?.normal_balance ?? null,
    name: row.chart_of_accounts?.account_name ?? "Unnamed",
    code: row.chart_of_accounts?.account_code ?? "",
    title: row.chart_of_accounts?.account_name ?? "Unnamed",
    subtitle: row.chart_of_accounts?.account_code ?? "",
  }));
}
