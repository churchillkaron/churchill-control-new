import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) {
  return String(value ?? "").trim();
}

export async function resolvePlatformOperatorOrganizationId() {
  const configured = text(process.env.AVANTIQO_ORGANIZATION_ID);
  if (configured) return configured;

  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id,name,status,organization_status")
    .eq("name", "Avantiqo Platform")
    .limit(2);

  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  if (rows.length !== 1) {
    throw new Error("AVANTIQO_OPERATOR_ORGANIZATION_CONFIGURATION_REQUIRED");
  }

  return rows[0].id;
}

export async function isPlatformOperatorWorkspace(organizationId) {
  const selectedOrganizationId = text(organizationId);
  if (!selectedOrganizationId) return false;

  const operatorOrganizationId = await resolvePlatformOperatorOrganizationId();
  return selectedOrganizationId === operatorOrganizationId;
}

export const PlatformOperatorWorkspaceRuntime = {
  resolveOrganizationId: resolvePlatformOperatorOrganizationId,
  isOperatorWorkspace: isPlatformOperatorWorkspace,
};
