import {
  getErpDomains,
  getErpSolutions,
} from "@/lib/platform/registry/erpRegistry";

import {
  getNavigationTree,
} from "@/lib/platform/navigation/getNavigationTree";

/**
 * Avantiqo ERP Navigation Runtime
 *
 * Canonical model:
 * - ERP domains from ERP_REGISTRY
 * - Installed solutions from ERP_REGISTRY filtered by active modules
 * - Workspace/page tree from platform_navigation
 */

export async function buildNavigationRuntime(context = {}) {
  const navigationTree =
    await getNavigationTree();

  const modules =
    context.modules ||
    context.activeModules ||
    [];

  const activeIds =
    new Set(
      (modules || []).map((module) =>
        String(
          module.id ||
          module.module_id ||
          module.solution_id ||
          module.route ||
          ""
        )
          .replace("/", "")
          .toLowerCase()
      )
    );

  const domains =
    getErpDomains();

  const solutions =
    getErpSolutions(activeIds);

  return {
    success: true,
    navigation: {
      domains,
      solutions,
      tree: navigationTree.tree || [],
    },
  };
}
