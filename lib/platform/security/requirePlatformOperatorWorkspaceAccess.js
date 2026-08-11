import { requirePlatformAdminAccess } from "@/lib/platform/security/requirePlatformAdminAccess";
import { isPlatformOperatorWorkspace } from "@/lib/platform/security/PlatformOperatorWorkspaceRuntime";

function text(value) {
  return String(value ?? "").trim();
}

export async function requirePlatformOperatorWorkspaceAccess({ organizationId } = {}) {
  const selectedOrganizationId = text(organizationId);
  if (!selectedOrganizationId) {
    return {
      success: false,
      status: 400,
      error: "organization_id required",
    };
  }

  const access = await requirePlatformAdminAccess();
  if (!access.success) return access;

  const operatorWorkspace = await isPlatformOperatorWorkspace(selectedOrganizationId)
    .catch(() => false);

  if (!operatorWorkspace) {
    return {
      success: false,
      status: 404,
      error: "Platform control plane is not available in this workspace",
    };
  }

  return {
    ...access,
    success: true,
    status: 200,
    organizationId: selectedOrganizationId,
    isPlatformOperatorWorkspace: true,
  };
}
