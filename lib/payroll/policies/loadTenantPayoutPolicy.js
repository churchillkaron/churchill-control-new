import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function loadTenantPayoutPolicy(organizationId) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const { data, error } = await supabaseAdmin
    .from("organization_payout_policies")
    .select("*")
    .eq("organization_id", organizationId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}
