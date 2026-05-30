import { supabase } from "@/lib/supabase";

export async function getChartOfAccounts({
  tenantId,
}) {
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("code", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return data;
}
