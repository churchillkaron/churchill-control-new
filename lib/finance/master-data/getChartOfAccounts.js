import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function getChartOfAccounts({
  organizationId,
}) {
  const { data, error } = await supabase
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
