import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { defaultChartOfAccounts } from "./defaultChartOfAccounts";

export async function seedChartOfAccounts({
  tenantId,
}) {
  const rows = defaultChartOfAccounts.map((account) => ({
    tenant_id: tenantId,
    code: account.code,
    name: account.name,
    category: account.category,
    subcategory: account.subcategory || null,
    normal_balance: account.normal_balance,
    is_active: true,
  }));

  const { data, error } = await supabaseAdmin
    .from("chart_of_accounts")
    .insert(rows)
    .select();

  if (error) {
    throw error;
  }

  return data;
}
