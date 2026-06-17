import { supabaseClient } from "@/lib/shared/supabase/client";

/**
 * AVANTIQO SYSTEM CONTEXT (SAAS FINAL VERSION)
 */

export async function getSystemContextFromDB(tenantId) {
  if (!tenantId) return null;

  const { data, error } = await supabaseClient
    .from("organization_users")
    .select(`
      organization_id,
      role,
      plan,
      organizations (
        id,
        name,
        industry,
        organization_type
      )
    `)
    .eq("tenant_user_id", tenantId)
    .maybeSingle();

  if (error || !data) {
    console.error("system context error:", error);
    return null;
  }

  return {
    tenantId,
    organizationId: data.organization_id,
    role: data.role || "STAFF",
    plan: data.plan || "free",
    industry: data.organizations?.industry || "agency",
    organization: data.organizations,
  };
}
