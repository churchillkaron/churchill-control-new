import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getGeneralLedger({
  organizationId,
  entityId,
  startDate,
  endDate,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!entityId) throw new Error("entityId required");

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

  if (startDate) query = query.gte("posting_date", startDate);
  if (endDate) query = query.lte("posting_date", endDate);

  const { data, error } = await query.order("posting_date", {
    ascending: true,
  });

  if (error) throw error;

  console.dir(data,{depth:null});

  return (data || []).map((r)=>({
    ...r,

    account_code:
      r.chart_of_accounts?.account_code ?? null,

    account_name:
      r.chart_of_accounts?.account_name ?? null,

    account_category:
      r.chart_of_accounts?.account_category ?? null,

    account_type:
      r.chart_of_accounts?.account_type ?? null,

    normal_balance:
      r.chart_of_accounts?.normal_balance ?? null,

    name:
      r.chart_of_accounts?.account_name ?? "Unnamed",

    code:
      r.chart_of_accounts?.account_code ?? "",

    title:
      r.chart_of_accounts?.account_name ?? "Unnamed",

    subtitle:
      r.chart_of_accounts?.account_code ?? "",
  }));
}
