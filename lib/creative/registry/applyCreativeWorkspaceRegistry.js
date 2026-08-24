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

function list(value) {
  return Array.isArray(value) ? value : [];
}

function findDesignStudio(registry) {
  const groups = list(registry?.workspaces?.commercial?.groups);
  for (const group of groups) {
    const studio = list(group?.items).find(
      (item) => item?.id === "design_studio" || item?.route === "/commercial/design",
    );
    if (studio) return studio;
  }
  return null;
}

export function applyCreativeWorkspaceRegistry(registry) {
  const studio = findDesignStudio(registry);
  if (!studio) return registry;

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

  return registry;
}

export const CREATIVE_MUSIC_WORKSPACE = MUSIC_WORKSPACE;
