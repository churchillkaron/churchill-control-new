import { buildWorkspaceRuntime } from "@/lib/platform/runtime/buildWorkspaceRuntime";

export async function getOrganizationWorkspace({ userEmail, organizationId }) {
  return await buildWorkspaceRuntime({ userEmail, organizationId });
}
