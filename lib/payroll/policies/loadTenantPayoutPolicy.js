import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export default async function loadTenantPayoutPolicy(
  tenantId
) {

  const {
    data,
    error,
  } = await supabaseAdmin

    .from(
      "tenant_payout_policies"
    )

    .select("*")

    .eq(
      "tenant_id",
      tenantId
    )

    .limit(1)

    .single();

  if (error) {
    throw error;
  }

  return data;

}
