import { supabase } from "@/lib/shared/supabase/client";

/**
 * SINGLE SOURCE OF TRUTH FOR IDENTITY
 * This resolves tenant + organization for ALL requests
 */
export async function resolveIdentity({ userEmail }) {

  if (!userEmail) {
    throw new Error("Missing userEmail for identity resolution");
  }

  // 1. Get staff record
  const { data: staff, error } = await supabase
    .from("organization_users")
    .select("*")
    .eq("email", userEmail)
    .single();

  if (error || !staff) {
    throw new Error("Staff not found for identity resolution");
  }

  // 2. Resolve organization
  const organizationId = staff.organization_id;

  if (!organizationId) {
    throw new Error("No organization assigned to staff");
  }

  // 3. Resolve tenant (for runtime isolation)
  const { data: mapping } = await supabase
    .from("tenant_organizations")
    .select("tenant_id")
    .eq("organization_id", organizationId)
    .single();

  const tenantId = mapping?.tenant_id || null;

  return {
    staff_id: staff.id,
    organization_id: organizationId,
    tenant_id: tenantId
  };
}
