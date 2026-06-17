import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function loadTenantPayoutPolicy(
  tenantId
) {
  console.log("LOAD POLICY", tenantId);

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("tenant_payout_policies")
    .select("*")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();

  console.log("POLICY RESULT", {
    data,
    error,
  });

  if (error) {
    throw error;
  }

  return data;
}
