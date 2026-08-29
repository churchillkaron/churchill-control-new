const MUSIC_WORKSPACE = Object.freeze({
  id: "music",
  title: "Music",
  engine: "music",
  renderer: "dynamic",
  layout: {
    dock: true,
    inspector: true,
  },
});

const CREATIVE_DOMAIN = Object.freeze({
  id: "creative",
  name: "Creative",
  route: "/creative",
  type: "core",
  order: 25,
  description: "Marketing, design, music and creative production.",
});

const MARKETING_CAPABILITY = Object.freeze({
  id: "marketing",
  name: "Marketing",
  route: "/creative/marketing",
  description: "Campaigns, paid media, publishing, audiences, brand and growth execution.",
  order: 10,
  status: "active",
  type: "operational-workspace",
  document: "MarketingCampaign",
});

const MUSIC_STUDIO_CAPABILITY = Object.freeze({
  id: "music_studio",
  name: "Music Studio",
  route: "/creative/music",
  description: "Create, record, arrange, edit, mix and master music in the owned Avantiqo studio.",
  order: 20,
  status: "active",
  type: "operational-workspace",
  renderer: "CreativeWorkspaceRenderer",
  runtime: "resolveCreativeStudioRuntime",
  document: "CreativeAsset",
  workspace: "music",
});

function list(value) {
  return Array.isArray(value) ? value : [];
}

function sortByOrder(items) {
  return [...list(items)].sort(
    (left, right) => Number(left?.order || 0) - Number(right?.order || 0),
  );
}

function ensureDomain(registry) {
  const domains = list(registry?.domains);
  const existingIndex = domains.findIndex((domain) => domain?.id === CREATIVE_DOMAIN.id);

  if (existingIndex >= 0) {
    domains[existingIndex] = {
      ...domains[existingIndex],
      ...CREATIVE_DOMAIN,
    };
  } else {
    domains.push({ ...CREATIVE_DOMAIN });
  }

  registry.domains = sortByOrder(domains);
}

function findCommercialMarketing(registry) {
  const commercial = registry?.workspaces?.commercial;
  const groups = list(commercial?.groups);
  const index = groups.findIndex((group) => group?.id === "marketing");

  return {
    commercial,
    groups,
    index,
    group: index >= 0 ? groups[index] : null,
  };
}

function findDesignStudioInGroups(groups) {
  for (const group of list(groups)) {
    const studio = list(group?.items).find(
      (item) =>
        item?.id === "design_studio" ||
        item?.route === "/commercial/design" ||
        item?.route === "/creative/design",
    );
    if (studio) return studio;
  }
  return null;
}

function ensureMusicWorkspace(studio) {
  if (!studio) return null;

  const workspaces = list(studio.workspaces);
  if (!workspaces.some((workspace) => workspace?.id === MUSIC_WORKSPACE.id)) {
    const productionIndex = workspaces.findIndex((workspace) => workspace?.id === "production");
    const insertAt = productionIndex >= 0 ? productionIndex + 1 : workspaces.length;
    studio.workspaces = [
      ...workspaces.slice(0, insertAt),
      { ...MUSIC_WORKSPACE, layout: { ...MUSIC_WORKSPACE.layout } },
      ...workspaces.slice(insertAt),
    ];
  }

  if (!list(studio.engines).includes("music")) {
    studio.engines = [...list(studio.engines), "music"];
  }

  return studio;
}

function buildCreativeDesignStudio(source) {
  if (!source) return null;

  const studio = {
    ...source,
    id: "design_studio",
    name: "Design Studio",
    route: "/creative/design",
    description:
      "Creative operating system for missions, briefs, research, strategy, concepts, storyboards and production.",
    order: 10,
    status: "active",
  };

  studio.workspaces = list(source.workspaces).map((workspace) => ({
    ...workspace,
    layout: workspace?.layout ? { ...workspace.layout } : workspace?.layout,
  }));
  studio.engines = [...list(source.engines)];

  return ensureMusicWorkspace(studio);
}

function removeMarketingOwnershipFromCommercial({ commercial, groups, index }) {
  if (!commercial || index < 0) return;

  commercial.groups = groups.filter((_, groupIndex) => groupIndex !== index);
  commercial.description = "Manage sales, customers, reviews and revenue activity.";
}

function createCreativeWorkspace({ designStudio, marketingGroup }) {
  const marketing = {
    ...MARKETING_CAPABILITY,
    capabilities: list(marketingGroup?.items)
      .filter((item) => item?.id !== "design_studio")
      .map((item) => ({ ...item })),
  };

  const studioItems = [
    designStudio,
    { ...MUSIC_STUDIO_CAPABILITY },
  ].filter(Boolean);

  return {
    title: "Creative",
    description: "Marketing, design, music and creative production in one domain.",
    groups: [
      {
        id: "marketing",
        name: "Marketing",
        description: "Plan, publish, advertise and optimize growth activity.",
        order: 10,
        items: [marketing],
      },
      {
        id: "studios",
        name: "Studios",
        description: "Create and produce owned visual and audio work.",
        order: 20,
        items: studioItems,
      },
    ],
  };
}

export function applyCreativeWorkspaceRegistry(registry) {
  if (!registry || typeof registry !== "object") return registry;

  ensureDomain(registry);

  const commercialMarketing = findCommercialMarketing(registry);
  const existingCreative = registry?.workspaces?.creative;
  const sourceDesignStudio =
    findDesignStudioInGroups([commercialMarketing.group]) ||
    findDesignStudioInGroups(existingCreative?.groups);
  const designStudio = buildCreativeDesignStudio(sourceDesignStudio);

  removeMarketingOwnershipFromCommercial(commercialMarketing);

  registry.workspaces = registry.workspaces || {};
  registry.workspaces.creative = createCreativeWorkspace({
    designStudio,
    marketingGroup: commercialMarketing.group,
  });

  return registry;
}

export const CREATIVE_MUSIC_WORKSPACE = MUSIC_WORKSPACE;
export const CREATIVE_DOMAIN_DEFINITION = CREATIVE_DOMAIN;
