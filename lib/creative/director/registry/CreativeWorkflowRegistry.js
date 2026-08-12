const WORKFLOWS = Object.freeze([
  Object.freeze({
    workflow_kind: "TEMPORAL",
    executor: "TEMPORAL",
    finaliser: "TEMPORAL",
    aliases: Object.freeze(["TEMPORAL", "FILM", "VIDEO", "ANIMATION"]),
  }),
  Object.freeze({
    workflow_kind: "STILL",
    executor: "UNIVERSAL",
    finaliser: "UNIVERSAL",
    aliases: Object.freeze(["STILL", "IMAGE", "POSTER", "BANNER", "BANNER_SET"]),
  }),
  Object.freeze({
    workflow_kind: "DOCUMENT",
    executor: "UNIVERSAL",
    finaliser: "UNIVERSAL",
    aliases: Object.freeze(["DOCUMENT", "MENU", "PRESENTATION", "REPORT", "BROCHURE"]),
  }),
  Object.freeze({
    workflow_kind: "INTERACTIVE",
    executor: "UNIVERSAL",
    finaliser: "UNIVERSAL",
    aliases: Object.freeze(["INTERACTIVE", "WEBSITE", "WEBPAGE", "LANDING_PAGE"]),
  }),
  Object.freeze({
    workflow_kind: "SOFTWARE",
    executor: "UNIVERSAL",
    finaliser: "UNIVERSAL",
    aliases: Object.freeze(["SOFTWARE", "APPLICATION", "APP"]),
  }),
  Object.freeze({
    workflow_kind: "AUDIO",
    executor: "UNIVERSAL",
    finaliser: "UNIVERSAL",
    aliases: Object.freeze(["AUDIO", "VOICE", "MUSIC", "PODCAST"]),
  }),
  Object.freeze({
    workflow_kind: "CAMPAIGN_SYSTEM",
    executor: "UNIVERSAL",
    finaliser: "UNIVERSAL",
    aliases: Object.freeze(["CAMPAIGN_SYSTEM", "CAMPAIGN", "MULTIMEDIA"]),
  }),
]);

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

const byKind = new Map(
  WORKFLOWS.map((entry) => [entry.workflow_kind, entry]),
);

const byAlias = new Map(
  WORKFLOWS.flatMap((entry) =>
    entry.aliases.map((alias) => [normalize(alias), entry]),
  ),
);

function declaredValue(input = {}, project = {}) {
  const candidates = [
    [input.workflow_kind, "REQUEST_WORKFLOW_KIND"],
    [input.creative_medium, "REQUEST_CREATIVE_MEDIUM"],
    [project.metadata?.workflow_kind, "PROJECT_WORKFLOW_KIND"],
    [project.metadata?.creative_medium, "PROJECT_CREATIVE_MEDIUM"],
    [project.production_type, "PROJECT_PRODUCTION_TYPE"],
  ];

  for (const [value, source] of candidates) {
    const normalized = normalize(value);
    if (normalized) return { value: normalized, source };
  }

  return null;
}

function stateValue(project = {}, tasks = []) {
  const taskWorkflow = tasks.find((task) => task.metadata?.workflow_kind)
    ?.metadata?.workflow_kind;
  const candidates = [
    [project.metadata?.workflow_kind, "PROJECT_WORKFLOW_KIND"],
    [project.metadata?.creative_medium, "PROJECT_CREATIVE_MEDIUM"],
    [taskWorkflow, "TASK_WORKFLOW_KIND"],
    [project.production_type, "PROJECT_PRODUCTION_TYPE"],
  ];

  for (const [value, source] of candidates) {
    const normalized = normalize(value);
    if (normalized) return { value: normalized, source };
  }

  return null;
}

function resolveRegistered(value, source = "UNSPECIFIED") {
  const normalized = normalize(value);
  if (!normalized) return null;
  const workflow = byAlias.get(normalized) || null;
  if (!workflow) {
    throw new Error(`CREATIVE_WORKFLOW_ALIAS_NOT_REGISTERED:${normalized}`);
  }
  return {
    ...workflow,
    declared_value: normalized,
    source,
  };
}

export const CreativeWorkflowRegistry = Object.freeze({
  list() {
    return [...WORKFLOWS];
  },

  get(workflowKind) {
    return byKind.get(normalize(workflowKind)) || null;
  },

  resolveAlias(value) {
    return resolveRegistered(value, "ALIAS");
  },

  resolveDeclared({ input = {}, project = {} } = {}) {
    const declared = declaredValue(input, project);
    return declared
      ? resolveRegistered(declared.value, declared.source)
      : null;
  },

  resolveState({ project = {}, tasks = [] } = {}) {
    const declared = stateValue(project, tasks);
    return declared
      ? resolveRegistered(declared.value, declared.source)
      : null;
  },

  require(workflowKind) {
    const workflow = byKind.get(normalize(workflowKind)) || null;
    if (!workflow) {
      throw new Error(
        `CREATIVE_WORKFLOW_NOT_REGISTERED:${normalize(workflowKind) || "UNKNOWN"}`,
      );
    }
    return workflow;
  },
});
