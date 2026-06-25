import { SYSTEM_REGISTRY } from "@/lib/shared/architecture/systemRegistry";
import { getNavigationTree } from "@/lib/platform/navigation/getNavigationTree";

/**
 * Navigation Runtime
 *
 * Executive navigation comes from SYSTEM_REGISTRY.
 * Business navigation comes from platform_navigation.
 */

export async function buildNavigationRuntime() {
  const navigationTree = await getNavigationTree();

  const executive = Object.entries(SYSTEM_REGISTRY).map(
    ([id, config]) => ({
      id,
      name: config.title,
      owner: config.owner,
      status: config.status,
    })
  );

  return {
    success: true,
    navigation: {
      executive,
      tree: navigationTree.tree || [],
    },
  };
}
