import { getSystemContextFromDB } from "@/lib/platform/context/getSystemContextFromDB";
import { buildNavigationRuntime } from "@/lib/platform/runtime/buildNavigationRuntime";

/**
 * AVANTIQO MASTER OS PIPELINE
 * SINGLE SOURCE OF TRUTH FOR UI
 */

export async function getWorkspaceState(tenantId) {
  if (!tenantId) {
    return {
      ready: false,
      context: null,
      navigation: {},
    };
  }

  const context = await getSystemContextFromDB(tenantId);

  if (!context) {
    return {
      ready: false,
      context: null,
      navigation: {},
    };
  }

  const navigation = await buildNavigationRuntime(context);

  return {
    ready: true,
    context,
    navigation,
  };
}
