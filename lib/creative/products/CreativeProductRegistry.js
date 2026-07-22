const WORKSPACE_TITLES = {
  mission: "Mission",
  brief: "Understanding",
  research: "Discovery",
  strategy: "Creative Direction",
  concept: "Concept Development",
  assets: "Source Material",
  storyboard: "Visual Planning",
  production: "Production",
  timeline: "Edit & Sequence",
  documents: "Content & Documentation",
  render: "Finish & Quality",
  publishing: "Release",
  learning: "Learning",
};

const DEFAULT_WORKFLOW = [
  "mission",
  "brief",
  "research",
  "strategy",
  "concept",
  "assets",
  "production",
  "render",
  "publishing",
  "learning",
].map((workspaceId) => ({
  id: workspaceId,
  workspace_id: workspaceId,
  title: WORKSPACE_TITLES[workspaceId],
}));

function normalizeWorkflowItem(item, index) {
  if (!item) return null;

  const workspaceId = String(
    item.workspace_id || item.workspace || item.id || "",
  ).trim().toLowerCase();

  if (!workspaceId) return null;

  return {
    id: String(item.id || `${workspaceId}_${index + 1}`),
    workspace_id: workspaceId,
    title:
      String(item.title || item.name || WORKSPACE_TITLES[workspaceId] || workspaceId)
        .trim(),
    stage: item.stage || null,
    description: item.description || null,
    capabilities: Array.isArray(item.capabilities)
      ? item.capabilities
      : [],
    required: item.required !== false,
  };
}

function missionMetadata(runtime = {}) {
  const project = runtime.projectRuntime?.current || {};
  const mission = runtime.missionRuntime?.current || {};

  return {
    ...(mission.metadata || {}),
    ...(project.metadata || {}),
  };
}

export function resolveCreativeMissionDefinition(runtime = {}) {
  const metadata = missionMetadata(runtime);
  const configured = Array.isArray(metadata.mission_workflow)
    ? metadata.mission_workflow
    : Array.isArray(metadata.workflow)
      ? metadata.workflow
      : [];
  const workflow = configured
    .map(normalizeWorkflowItem)
    .filter(Boolean);

  return {
    id: "OPEN_CREATIVE_MISSION",
    title:
      runtime.missionRuntime?.current?.title ||
      runtime.missionRuntime?.current?.business_goal ||
      "Creative Mission",
    creative_thesis: metadata.creative_thesis || null,
    deliverables: Array.isArray(metadata.deliverables)
      ? metadata.deliverables
      : [],
    departments: Array.isArray(metadata.mission_departments)
      ? metadata.mission_departments
      : Array.isArray(metadata.departments)
        ? metadata.departments
        : [],
    workflow: workflow.length ? workflow : DEFAULT_WORKFLOW,
    quality_policy: metadata.quality_policy || {},
    source_request: metadata.source_request || null,
  };
}

export function resolveCreativeProductDefinition(value, runtime = {}) {
  return resolveCreativeMissionDefinition(runtime);
}

export const CREATIVE_PRODUCT_REGISTRY = Object.freeze({
  OPEN_CREATIVE_MISSION: {
    id: "OPEN_CREATIVE_MISSION",
    title: "Creative Mission",
    workflow: DEFAULT_WORKFLOW,
  },
});
