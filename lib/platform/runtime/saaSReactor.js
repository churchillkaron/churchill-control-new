import { getSystemContextFromDB } from "@/lib/platform/context/getSystemContextFromDB";
import { buildNavigationRuntime } from "@/lib/platform/runtime/buildNavigationRuntime";

/**
 * AVANTIQO SAAS REACTOR
 * Rebuilds system state when plan changes
 */

export async function rebuildWorkspaceState(tenantId) {
  const context = await getSystemContextFromDB(tenantId);

  if (!context) return null;

  const navigation = await buildNavigationRuntime(context);

  return {
    context,
    navigation,
  };
}
