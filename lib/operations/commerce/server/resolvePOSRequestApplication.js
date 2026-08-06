import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolvePOSApplicationDefinition } from "@/lib/operations/commerce/server/POSApplicationRegistry";

function isMissingRow(error) {
  return error?.code === "PGRST116";
}

async function loadOrganization(organizationId, access) {
  if (access?.organization?.id === organizationId) {
    return access.organization;
  }

  const result = await supabaseAdmin
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .maybeSingle();

  if (result.error && !isMissingRow(result.error)) throw result.error;
  return result.data || null;
}

async function loadPOSSettings(organizationId) {
  const result = await supabaseAdmin
    .from("operational_settings")
    .select("settings")
    .eq("organization_id", organizationId)
    .eq("domain", "POS")
    .maybeSingle();

  if (result.error && !isMissingRow(result.error)) throw result.error;

  return result.data?.settings && typeof result.data.settings === "object"
    ? result.data.settings
    : {};
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
  const [organization, settings] = await Promise.all([
    loadOrganization(resolvedOrganizationId, access),
    loadPOSSettings(resolvedOrganizationId),
  ]);
  const application = resolvePOSApplicationDefinition({
    organization,
    settings,
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
      settings,
    };
  }

  return {
    success: true,
    access,
    application,
    organization,
    organizationId: resolvedOrganizationId,
    settings,
  };
}

export default resolvePOSRequestApplication;
