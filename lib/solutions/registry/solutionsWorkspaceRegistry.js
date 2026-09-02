const SOLUTIONS_DOMAIN = {
  id: "solutions",
  name: "Solutions",
  route: "/solutions",
  type: "core",
  order: 115,
  description: "Install, configure and govern industry solution packs over the shared Avantiqo core.",
};

export function applySolutionsWorkspaceRegistry(registry) {
  if (!registry) return registry;

  const domains = Array.isArray(registry.domains) ? registry.domains : [];
  if (!domains.some((domain) => domain?.id === SOLUTIONS_DOMAIN.id)) {
    registry.domains = [...domains, SOLUTIONS_DOMAIN].sort(
      (left, right) => Number(left?.order || 0) - Number(right?.order || 0),
    );
  }

  registry.workspaces = registry.workspaces || {};
  if (!registry.workspaces.solutions) {
    registry.workspaces.solutions = {
      title: "Solutions",
      description:
        "Install, assess and operate industry capability packs without hardcoding industry behavior into core ERP domains.",
      groups: [],
    };
  }

  return registry;
}

export default applySolutionsWorkspaceRegistry;
