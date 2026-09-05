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

const REVIEW_WORKSPACE = Object.freeze({
  id: "review",
  title: "Review",
  engine: "review",
  renderer: "dynamic",
  layout: {
    dock: false,
    inspector: false,
  },
});

const CREATIVE_DOMAIN = Object.freeze({
  id: "creative",
  name: "Creative",
  route: "/creative",
  type: "core",
  order: 25,
  description: "Automatic agency execution plus specialist image, video, voice, music, code, web and marketing studios.",
});

const MARKETING_CAPABILITY = Object.freeze({
  id: "marketing",
  name: "Marketing Studio",
  route: "/creative/marketing",
  description: "Specialist campaign, paid media, publishing, audience, brand and growth execution.",
  order: 70,
  status: "active",
  type: "operational-workspace",
  document: "MarketingCampaign",
});

const IMAGE_STUDIO_CAPABILITY = Object.freeze({
  id: "image_studio",
  name: "Image Studio",
  route: "/creative/image",
  description: "Specialist image creation, editing, review and production through the governed Image runtime.",
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
  description: "Specialist film and motion production through the governed Video runtime.",
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
  description: "Specialist speech, narration and audio work while the governed Voice runtime remains the execution boundary.",
  order: 40,
  status: "active",
  type: "operational-workspace",
  document: "CreativeAsset",
});

const MUSIC_STUDIO_CAPABILITY = Object.freeze({
  id: "music_studio",
  name: "Music Studio",
  route: "/creative/music",
  description: "Specialist music creation, recording, arrangement, editing, mixing and mastering.",
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
  description: "Specialist software creation through the governed Code workspace and sandbox controls.",
  order: 60,
  status: "active",
  type: "operational-workspace",
  document: "CodeWorkspace",
});

const WEB_BUILDER_CAPABILITY = Object.freeze({
  id: "web_builder",
  name: "Web Builder",
  route: "/creative/web",
  description: "Specialist website and digital-experience creation through the governed Web Builder runtime.",
  order: 80,
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
        item?.id === "creative_studio" ||
        item?.id === "design_studio" ||
        item?.route === "/creative/studio" ||
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

function ensureReviewWorkspace(studio) {
  if (!studio) return null;
  const workspaces = list(studio.workspaces);
  if (!workspaces.some((workspace) => workspace?.id === REVIEW_WORKSPACE.id)) {
    const timelineIndex = workspaces.findIndex((workspace) => workspace?.id === "timeline");
    const renderIndex = workspaces.findIndex((workspace) => workspace?.id === "render");
    const insertAt = timelineIndex >= 0
      ? timelineIndex + 1
      : renderIndex >= 0
        ? renderIndex
        : workspaces.length;
    studio.workspaces = [
      ...workspaces.slice(0, insertAt),
      { ...REVIEW_WORKSPACE, layout: { ...REVIEW_WORKSPACE.layout } },
      ...workspaces.slice(insertAt),
    ];
  }
  if (!list(studio.engines).includes("review")) {
    studio.engines = [...list(studio.engines), "review"];
  }
  return studio;
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

  return ensureReviewWorkspace(studio);
}

function buildAutomaticCreativeStudio(source) {
  return ensureMusicWorkspace(
    cloneStudio(source, {
      id: "creative_studio",
      name: "Creative Studio",
      route: "/creative/studio",
      description:
        "Automatic agency mode. Describe the business goal in normal language and Avantiqo plans, selects the specialist engines, produces, reviews, publishes and measures the work through the governed Creative lifecycle.",
      order: 10,
      status: "active",
      hidden: false,
      mode: "automatic",
      automatic: true,
    }),
  );
}

function buildCreativeDesignCompatibility(source) {
  return ensureMusicWorkspace(
    cloneStudio(source, {
      id: "design_studio",
      name: "Creative Studio Legacy Route",
      route: "/creative/design",
      description: "Hidden compatibility route for the previous Creative Studio URL.",
      order: 9998,
      status: "active",
      hidden: true,
      mode: "automatic",
      automatic: true,
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

function createCreativeWorkspace({ automaticStudio, legacyDesignStudio, marketingGroup }) {
  const marketing = {
    ...MARKETING_CAPABILITY,
    capabilities: list(marketingGroup?.items)
      .filter((item) => item?.id !== "design_studio")
      .map((item) => ({ ...item })),
  };

  const specialistItems = [
    { ...IMAGE_STUDIO_CAPABILITY },
    { ...VIDEO_STUDIO_CAPABILITY },
    { ...VOICE_STUDIO_CAPABILITY },
    { ...MUSIC_STUDIO_CAPABILITY },
    { ...CODE_STUDIO_CAPABILITY },
    marketing,
    { ...WEB_BUILDER_CAPABILITY },
  ];

  return {
    title: "Creative",
    description: "Automatic agency execution when you want Avantiqo to handle the whole job, plus separate specialist studios when you want direct control of a medium.",
    groups: [
      {
        id: "automatic",
        name: "Creative Studio",
        description: "Tell Avantiqo what you want to achieve. The Creative Director chooses and coordinates the specialist engines automatically.",
        order: 10,
        items: automaticStudio ? [automaticStudio] : [],
      },
      {
        id: "specialists",
        name: "Specialist Studios",
        description: "Open a specific medium when a specialist wants direct control of image, video, voice, music, code, marketing or web production.",
        order: 20,
        items: specialistItems,
      },
      {
        id: "creative_legacy_routes",
        name: "Creative Legacy Routes",
        description: "Hidden compatibility routes retained for existing links.",
        order: 9999,
        hidden: true,
        items: legacyDesignStudio ? [legacyDesignStudio] : [],
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
  const automaticStudio = buildAutomaticCreativeStudio(sourceDesignStudio);
  const legacyDesignStudio = buildCreativeDesignCompatibility(sourceDesignStudio);

  removeMarketingOwnershipFromCommercial(commercialMarketing);

  registry.workspaces = registry.workspaces || {};
  registry.workspaces.creative = createCreativeWorkspace({
    automaticStudio,
    legacyDesignStudio,
    marketingGroup: commercialMarketing.group,
  });

  return registry;
}

export const CREATIVE_MUSIC_WORKSPACE = MUSIC_WORKSPACE;
export const CREATIVE_REVIEW_WORKSPACE = REVIEW_WORKSPACE;
export const CREATIVE_DOMAIN_DEFINITION = CREATIVE_DOMAIN;
