const WORKFLOWS = Object.freeze([
  Object.freeze({
    workflow_kind: "TEMPORAL",
    executor: "TEMPORAL",
    aliases: Object.freeze(["TEMPORAL", "FILM", "VIDEO", "ANIMATION"]),
  }),
  Object.freeze({
    workflow_kind: "STILL",
    executor: "UNIVERSAL",
    aliases: Object.freeze(["STILL", "IMAGE", "POSTER", "BANNER", "BANNER_SET"]),
  }),
  Object.freeze({
    workflow_kind: "DOCUMENT",
    executor: "UNIVERSAL",
    aliases: Object.freeze(["DOCUMENT", "MENU", "PRESENTATION", "REPORT", "BROCHURE"]),
  }),
  Object.freeze({
    workflow_kind: "INTERACTIVE",
    executor: "UNIVERSAL",
    aliases: Object.freeze(["INTERACTIVE", "WEBSITE", "WEBPAGE", "LANDING_PAGE"]),
  }),
  Object.freeze({
    workflow_kind: "SOFTWARE",
    executor: "UNIVERSAL",
    aliases: Object.freeze(["SOFTWARE", "APPLICATION", "APP"]),
  }),
  Object.freeze({
    workflow_kind: "AUDIO",
    executor: "UNIVERSAL",
    aliases: Object.freeze(["AUDIO", "VOICE", "MUSIC", "PODCAST"]),
  }),
  Object.freeze({
    workflow_kind: "CAMPAIGN_SYSTEM",
    executor: "UNIVERSAL",
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

export const CreativeWorkflowRegistry = Object.freeze({
  list() {
    return [...WORKFLOWS];
  },

  get(workflowKind) {
    return byKind.get(normalize(workflowKind)) || null;
  },

  resolveAlias(value) {
    const normalized = normalize(value);
    return normalized ? byAlias.get(normalized) || null : null;
  },

  resolveDeclared({ input = {}, project = {} } = {}) {
    const declared = declaredValue(input, project);
    if (!declared) return null;

    const workflow = byAlias.get(declared.value) || null;
    if (!workflow) {
      throw new Error(`CREATIVE_WORKFLOW_ALIAS_NOT_REGISTERED:${declared.value}`);
    }

    return {
      ...workflow,
      declared_value: declared.value,
      source: declared.source,
    };
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
