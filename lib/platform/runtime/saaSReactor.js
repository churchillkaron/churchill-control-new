import { getSystemContextFromDB } from "@/lib/platform/context/getSystemContextFromDB";
import { buildNavigationRuntime } from "@/lib/platform/runtime/buildNavigationRuntime";

/**
 * AVANTIQO SAAS REACTOR
 */

export async function rebuildWorkspaceState(organizationId) {
  const context =
    await getSystemContextFromDB(organizationId);

  if (!context) return null;

  const navigation =
    await buildNavigationRuntime(context);

  return {
    context,
    navigation,
  };
}
