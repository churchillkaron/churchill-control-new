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
  description: "Image, video, voice, music, design, code, web and marketing in one creative domain.",
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

const IMAGE_STUDIO_CAPABILITY = Object.freeze({
  id: "image_studio",
  name: "Image Studio",
  route: "/creative/image",
  description: "Create and review image assets through the existing governed Creative production workspace.",
  order: 20,
  status: "active",
  type: "operational-workspace",
  renderer: "CreativeWorkspaceRenderer",
  runtime: "resolveCreativeStudioRuntime",
  document: "CreativeAsset",
  workspace: "production",
});

const VIDEO_STUDIO_CAPABILITY = Object.freeze({
  id: "video_studio",
  name: "Video Studio",
  route: "/creative/video",
  description: "Create and review video work through the existing governed Creative production workspace.",
  order: 30,
  status: "active",
  type: "operational-workspace",
  renderer: "CreativeWorkspaceRenderer",
  runtime: "resolveCreativeStudioRuntime",
  document: "CreativeAsset",
  workspace: "production",
});

const VOICE_STUDIO_CAPABILITY = Object.freeze({
  id: "voice_studio",
  name: "Voice Studio",
  route: "/creative/voice",
  description: "Enter the Creative voice surface while the existing governed Voice runtime remains the execution boundary.",
  order: 40,
  status: "active",
  type: "operational-workspace",
  document: "CreativeAsset",
});

const MUSIC_STUDIO_CAPABILITY = Object.freeze({
  id: "music_studio",
  name: "Music Studio",
  route: "/creative/music",
  description: "Create, record, arrange, edit, mix and master music in the owned Avantiqo studio.",
  order: 50,
  status: "active",
  type: "operational-workspace",
  renderer: "CreativeWorkspaceRenderer",
  runtime: "resolveCreativeStudioRuntime",
  document: "CreativeAsset",
  workspace: "music",
});

const CODE_STUDIO_CAPABILITY = Object.freeze({
  id: "code_studio",
  name: "Code Studio",
  route: "/creative/code",
  description: "Enter the governed Code workspace surface without bypassing its sandbox or local-computer runtime controls.",
  order: 60,
  status: "active",
  type: "operational-workspace",
  document: "CodeWorkspace",
});

const WEB_BUILDER_CAPABILITY = Object.freeze({
  id: "web_builder",
  name: "Web Builder",
  route: "/creative/web",
  description: "Customer-facing website creation workspace reserved for the future governed Web Builder runtime.",
  order: 70,
  status: "planned",
  type: "operational-workspace",
  document: "WebsiteProject",
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

function cloneStudio(source, overrides = {}) {
  if (!source) return null;

  return {
    ...source,
    ...overrides,
    workspaces: list(source.workspaces).map((workspace) => ({
      ...workspace,
      layout: workspace?.layout ? { ...workspace.layout } : workspace?.layout,
    })),
    engines: [...list(source.engines)],
  };
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
  return ensureMusicWorkspace(
    cloneStudio(source, {
      id: "design_studio",
      name: "Design Studio",
      route: "/creative/design",
      description:
        "Creative operating system for missions, briefs, research, strategy, concepts, storyboards and production.",
      order: 10,
      status: "active",
      hidden: false,
    }),
  );
}

function removeMarketingOwnershipFromCommercial({ commercial, groups, index, group }) {
  if (!commercial || index < 0) return;

  const sourceDesignStudio = findDesignStudioInGroups([group]);
  const compatibilityStudio = ensureMusicWorkspace(
    cloneStudio(sourceDesignStudio, {
      id: "creative_studio_legacy_contract",
      name: "Creative Studio Legacy Contract",
      route: "/commercial/design",
      order: 9999,
      status: "archived",
      hidden: true,
    }),
  );

  const remainingGroups = groups.filter((_, groupIndex) => groupIndex !== index);
  if (compatibilityStudio) {
    remainingGroups.push({
      id: "creative_legacy_contract",
      name: "Creative Legacy Contract",
      description: "Hidden compatibility contract for existing Creative runtime resolution.",
      order: 9999,
      items: [compatibilityStudio],
      hidden: true,
    });
  }

  commercial.groups = remainingGroups;
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
    { ...IMAGE_STUDIO_CAPABILITY },
    { ...VIDEO_STUDIO_CAPABILITY },
    { ...VOICE_STUDIO_CAPABILITY },
    { ...MUSIC_STUDIO_CAPABILITY },
    { ...CODE_STUDIO_CAPABILITY },
    { ...WEB_BUILDER_CAPABILITY },
  ].filter(Boolean);

  return {
    title: "Creative",
    description: "One front door for design, image, video, voice, music, code, web and marketing work.",
    groups: [
      {
        id: "studios",
        name: "Creative Studios",
        description: "Choose the medium. Existing governed runtimes remain the execution layer behind each studio.",
        order: 10,
        items: studioItems,
      },
      {
        id: "marketing",
        name: "Marketing",
        description: "Plan, publish, advertise and optimize growth activity.",
        order: 20,
        items: [marketing],
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
