import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getChartOfAccounts({
  organizationId,
}) {
  const { data, error } = await supabaseAdmin
    .from("chart_of_accounts")
    .select("*")
    .eq("organization_id", organizationId)
    .order("code", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  return data;
}
