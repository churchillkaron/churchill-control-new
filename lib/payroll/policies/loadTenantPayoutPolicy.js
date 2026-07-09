import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function loadTenantPayoutPolicy(
  tenantId
) {
  if (process.env.NODE_ENV !== "production") console.log("LOAD POLICY", tenantId);

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("organization_payout_policies")
    .select("*")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();

  if (process.env.NODE_ENV !== "production") console.log("POLICY RESULT", {
    data,
    error,
  });

  if (error) {
    throw error;
  }

  return data;
}
