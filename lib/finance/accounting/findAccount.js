import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export async function findAccount({
  tenantId,
  code,
}) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("chart_of_accounts")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("code", code)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;

}
