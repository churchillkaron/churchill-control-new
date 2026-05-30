import { supabase } from "@/lib/supabase";
import { defaultChartOfAccounts } from "./defaultChartOfAccounts";

export async function seedChartOfAccounts({
  tenantId,
}) {
  const rows = defaultChartOfAccounts.map((account) => ({
    tenant_id: tenantId,
    code: account.code,
    name: account.name,
    type: account.type,
    is_active: true,
  }));

  const { data, error } = await supabase
    .from("chart_of_accounts")
    .insert(rows)
    .select();

  if (error) {
    throw error;
  }

  return data;
}
