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
    {
      id: "operations",
      name: "Operations",
    },
    {
      id: "finance",
      name: "Finance",
    },
    {
      id: "people",
      name: "People",
    },
    {
      id: "growth",
      name: "Growth",
    },
    {
      id: "intelligence",
      name: "Intelligence",
    },
    {
      id: "platform",
      name: "Platform",
    },
  ];

  return {
    success: true,
    navigation: {
      executive,
      modules,
      groupedModules,
    },
  };
}
