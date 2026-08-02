import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolvePOSApplicationDefinition } from "@/lib/operations/commerce/server/POSApplicationRegistry";

async function loadOrganization(organizationId, access) {
  if (access?.organization?.id === organizationId) {
    return access.organization;
  }

  const result = await supabaseAdmin
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .maybeSingle();

  if (result.error) throw result.error;
  return result.data || null;
}

export async function resolvePOSRequestApplication({
  request,
  organizationId,
  requestedApplicationId,
}) {
  const access = await requireOrganizationAccess({
    organizationId,
    request,
  });

  if (!access.success) {
    return {
      success: false,
      error: access.error,
      status: access.status || 403,
    };
  }

  const resolvedOrganizationId = access.organizationId;
  const organization = await loadOrganization(resolvedOrganizationId, access);
  const application = resolvePOSApplicationDefinition({
    organization,
    requestedApplicationId,
  });

  if (!application) {
    return {
      success: false,
      error: "No POS application is configured for this organization",
      status: 409,
      access,
      organization,
      organizationId: resolvedOrganizationId,
    };
  }

  return {
    success: true,
    access,
    application,
    organization,
    organizationId: resolvedOrganizationId,
  };
}

export default resolvePOSRequestApplication;
