/**
 * Navigation Runtime
 *
 * Level 1 = Capability
 * Level 2 = Installed Modules
 *
 * Source of truth:
 * platform_modules.capability
 */

const HIDDEN_CONTAINER_MODULES = [
  "operations",
  "finance"
];

export async function buildNavigationRuntime({
  organization,
  role,
}) {
  const installedModules =
    Array.isArray(organization?.modules)
      ? organization.modules
      : [];

  const modules =
    installedModules.filter(
      (m) =>
        !HIDDEN_CONTAINER_MODULES.includes(
          String(
            m.id || m.module_id || ""
          ).toLowerCase()
        )
    );

  const groupedModules = {};

  for (const module of modules) {
    const capability =
      module.capability || "Platform";

    if (!groupedModules[capability]) {
      groupedModules[capability] = [];
    }

    groupedModules[capability].push({
      id:
        module.id ||
        module.module_id,

      module_id:
        module.id ||
        module.module_id,

      name:
        module.name,

      capability,

      route:
        "/" +
        String(
          module.route ||
          module.id ||
          module.module_id
        ),
    });
  }

  const executive = [
    "Operations",
    "Finance",
    "People",
    "Growth",
    "Intelligence",
    "Platform",
  ]
    .filter(
      capability =>
        groupedModules[capability]
    )
    .map(
      capability => ({
        id:
          capability.toLowerCase(),
        name:
          capability,
      })
    );

  return {
    success: true,
    navigation: {
      executive,
      modules,
      groupedModules,
    },
  };
}
