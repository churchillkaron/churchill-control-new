import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function findAccount({
  tenantId,
  code,
}) {
  let query = supabaseAdmin
    .from("chart_of_accounts")
    .select("*")
    .eq("code", String(code))
    .eq("is_active", true);

  if (tenantId) {
    query = query.or(
      `tenant_id.eq.${tenantId},tenant_id.is.null`
    );
  } else {
    query = query.is("tenant_id", null);
  }

  const { data, error } = await query
    .order("tenant_id", {
      ascending: false,
      nullsFirst: false,
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error(`Account not found for code ${code}`);
  }

  return data;
}
