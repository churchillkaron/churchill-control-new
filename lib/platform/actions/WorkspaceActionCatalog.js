export const WORKSPACE_ACTION_CATALOG = {
  create: { id: "create", name: "Create", engine: "create", icon: "Plus", scope: "record" },
  edit: { id: "edit", name: "Edit", engine: "form", icon: "Pencil", scope: "record" },
  duplicate: { id: "duplicate", name: "Duplicate", engine: "confirm", icon: "Copy", scope: "record" },
  merge: { id: "merge", name: "Merge", engine: "merge", icon: "GitMerge", scope: "selection" },
  split: { id: "split", name: "Split", engine: "split", icon: "Split", scope: "record" },
  archive: { id: "archive", name: "Archive", engine: "confirm", icon: "Archive", scope: "record" },
  delete: { id: "delete", name: "Delete", engine: "confirm", icon: "Trash", scope: "record" },
  restore: { id: "restore", name: "Restore", engine: "confirm", icon: "RotateCcw", scope: "record" },

  import: { id: "import", name: "Import", engine: "import", icon: "Upload", scope: "workspace" },
  export: { id: "export", name: "Export", engine: "export", icon: "Download", scope: "workspace" },

  ai: { id: "ai", name: "AI", engine: "ai", icon: "Sparkles", scope: "workspace" },

  submit: { id: "submit", name: "Submit", engine: "workflow", scope: "record" },
  approve: { id: "approve", name: "Approve", engine: "workflow", scope: "record" },
  reject: { id: "reject", name: "Reject", engine: "workflow", scope: "record" },
};

export function getWorkspaceActionDefinition(actionId) {
  return WORKSPACE_ACTION_CATALOG[actionId] || null;
}

export function buildWorkspaceAction({

  workspaceId,

  itemId,

  actionId,

  item = {},

  overrides = {},

}) {

  const base =
    getWorkspaceActionDefinition(actionId) || {

      id: actionId,

      name: actionId,

      engine: actionId,

      scope: "record",

    };

  const normalizedItem =
    String(itemId || "")
      .replace(/_/g,"-")
      .toLowerCase();

  return {

    ...base,

    capability:
      item.capability ||
      overrides.capability ||
      `${workspaceId}.${normalizedItem}`,

    domain:
      item.domain,

    boundedContext:
      item.boundedContext,

    category:
      item.category,

    renderer:
      item.renderer,

    document:
      item.document,

    aggregate:
      item.aggregate,

    repository:
      item.repository,

    workflow:
      item.workflow,

    form:
      item.form,

    table:
      item.table,

    api:
      item.api,

    reports:
      item.reports || [],

    search:
      item.search || [],

    ai:
      item.ai || [],

    permissions:

      overrides.permissions ||

      item.permissions ||

      [`${workspaceId}.${normalizedItem}.${actionId}`],

    ...overrides,

  };

}
