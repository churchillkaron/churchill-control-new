import { getSystemContextFromDB } from "@/lib/platform/context/getSystemContextFromDB";
import { buildNavigationRuntime } from "@/lib/platform/runtime/buildNavigationRuntime";

/**
 * AVANTIQO MASTER OS PIPELINE
 */

export async function getWorkspaceState(organizationId) {
  if (!organizationId) {
    return {
      ready: false,
      context: null,
      navigation: {},
    };
  }

  const context =
    await getSystemContextFromDB(organizationId);

  if (!context) {
    return {
      ready: false,
      context: null,
      navigation: {},
    };
  }

  const navigation =
    await buildNavigationRuntime(context);

  return {
    ready: true,
    context,
    navigation,
  };
}
