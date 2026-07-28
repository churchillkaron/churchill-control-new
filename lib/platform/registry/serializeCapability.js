import {
  getFinancePrimaryActionPolicy,
  resolveFinanceOperationalAction,
} from "@/lib/finance/ui/FinancePrimaryActionPolicy";
import {
  getFinanceWorkspaceContract,
} from "@/lib/finance/workspaces/FinanceWorkspaceContracts";
import {
  resolveFinanceWorkspaceMutationPolicy,
} from "@/lib/finance/workspaces/FinanceWorkspaceMutationPolicy";
import financeRuntimeManifest from "@/lib/finance/runtime/financeCapabilityRuntimeManifest.json";

function actionList(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.entries(value).map(([id, action]) => ({ id, ...(action || {}) }));
  }
  return [];
}

function dedupeActions(actions) {
  const seen = new Set();
  return actionList(actions).filter((action) => {
    const key = String(action?.id || action?.type || action?.label || "")
      .trim()
      .toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function actionKind(action) {
  return String(action?.action || action?.type || action?.id || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
}

function normalizeFinanceJournalCapability(capability) {
  if (capability?.id !== "journals") return capability;

  const currentRowMenu = actionList(
    capability?.rowMenu || capability?.ui?.rowMenu
  );

  const rowMenu = currentRowMenu.map((action) => {
    const kind = actionKind(action);
    if (kind !== "open" && kind !== "view") return action;

    return {
      ...action,
      id: "journal_detail",
      type: "journal_detail",
      engine: "finance_journal_detail",
      capability: null,
      action: null,
      document: "JournalEntry",
      label: action?.label || "Open",
      title: action?.title || "Journal Entry",
    };
  });

  return {
    ...capability,
    rowMenu,
    ui: {
      ...(capability.ui || {}),
      rowMenu,
    },
  };
}

function normalizeFinanceAccessCapability(capability) {
  if (capability?.id !== "finance_permissions") return capability;

  const create = {
    ...(capability.create || {}),
    enabled: true,
    type: "document",
    engine: "create",
    id: "finance_permission",
    form: "finance-permission",
    label: "+ Assign Role",
    title: "Assign Finance Role",
    api: "/api/finance/role-permissions/create",
    endpoint: "/api/finance/role-permissions/create",
  };

  const rowMenu = [
    {
      id: "open",
      type: "open",
      label: "View Access",
      title: "Finance Access Assignment",
      document: "FinanceAccessAssignment",
    },
    {
      id: "revoke_access",
      type: "archive",
      label: "Revoke Access",
      title: "Revoke Finance Access",
      endpoint: "/api/finance/role-permissions/revoke",
      method: "POST",
      danger: true,
    },
    { id: "history", type: "history", label: "Access History" },
  ];

  const topMenu = [
    { id: "new", type: "create", label: "+ Assign Role" },
  ];

  return {
    ...capability,
    name: "Finance Access",
    description:
      "Assign organisation-scoped Finance roles to staff and external accountants.",
    document: "FinanceAccessAssignment",
    status: "active",
    create,
    topMenu,
    rowMenu,
    runtime: {
      ...(capability.runtime || {}),
      renderer: "MasterDataRuntimeWorkCenter",
      createApi: "/api/finance/role-permissions/create",
      listApi: "/api/finance/role-permissions/list",
    },
    ui: {
      ...(capability.ui || {}),
      api: "/api/finance/role-permissions/list",
      rowsKey: "rows",
      search: ["user_name", "user_email", "role_name", "role_code"],
      topMenu,
      rowMenu,
      nameField: "user_name",
    },
  };
}

function normalizeOperationalAction(capabilityId, action) {
  if (!action) return null;
  return capabilityId === "bank_reconciliation"
    ? { ...action, method: "PUT" }
    : action;
}

function createLabel(capability, contract) {
  if (capability.id === "document_templates") return "+ Document Template";
  if (contract.singleton) return `Configure ${capability.name}`;
  const singular = String(capability.document || capability.name || "Record")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
  return `+ ${singular}`;
}

function mutationRowMenu(capability, contract, endpoint) {
  if (capability.id === "document_templates") {
    return [
      {
        id: "open",
        type: "open",
        document: "DocumentTemplate",
        label: "View Template",
      },
      {
        id: "edit_template",
        type: "edit",
        engine: "finance_document_template_builder",
        document: "DocumentTemplate",
        label: "Edit Template",
        title: "Edit Document Template",
      },
      {
        id: "activate_template",
        type: "publish",
        endpoint: "/api/finance/document-templates/activate",
        method: "POST",
        label: "Activate Template",
        title: "Activate Document Template",
      },
      { id: "history", type: "history", label: "Version History" },
      {
        id: "archive",
        type: "archive",
        endpoint,
        method: "DELETE",
        danger: true,
        label: "Archive Template",
      },
    ];
  }

  const mutation = resolveFinanceWorkspaceMutationPolicy(capability.id, contract);
  const name = capability.document || capability.name || "Record";
  const actions = [
    { id: "open", type: "open", document: capability.document },
  ];

  if (mutation.editable) {
    actions.push({
      id: "edit",
      type: "edit",
      engine: "finance_record_mutation",
      schema: contract.schema,
      endpoint,
      method: "PATCH",
      document: capability.document,
      label: `Edit ${name}`,
      title: `Edit ${name}`,
    });
  }

  if (mutation.duplicable) {
    actions.push({
      id: "duplicate",
      type: "duplicate",
      engine: "finance_record_mutation",
      schema: contract.schema,
      endpoint,
      method: "POST",
      document: capability.document,
      label: `Duplicate ${name}`,
      title: `Duplicate ${name}`,
    });
  }

  actions.push({ id: "history", type: "history" });

  if (mutation.archivable) {
    actions.push({
      id: "archive",
      type: "archive",
      endpoint,
      method: "DELETE",
      danger: true,
      label: `Archive ${name}`,
    });
  }

  return actions;
}

function normalizeClosedFinanceWorkspace(capability, contract) {
  const mutation = resolveFinanceWorkspaceMutationPolicy(capability.id, contract);
  const writable = mutation.writable;
  const endpoint = `/api/finance/workspaces/${capability.id}`;
  const isDocumentTemplate = capability.id === "document_templates";

  const create = writable
    ? {
        enabled: true,
        id: capability.id,
        engine: isDocumentTemplate
          ? "finance_document_template_builder"
          : "create",
        type: "document",
        schema: isDocumentTemplate ? [] : contract.schema,
        api: isDocumentTemplate
          ? "/api/finance/document-templates"
          : endpoint,
        endpoint: isDocumentTemplate
          ? "/api/finance/document-templates"
          : endpoint,
        label: createLabel(capability, contract),
        title: isDocumentTemplate
          ? "Create Document Template"
          : contract.singleton
            ? `Configure ${capability.name}`
            : `New ${capability.document || capability.name}`,
      }
    : { ...(capability.create || {}), enabled: false };

  const topMenu = dedupeActions([
    ...(writable ? [{ id: "new", type: "create", label: create.label }] : []),
    ...(contract.actions || []),
  ]);
  const rowMenu = mutationRowMenu(capability, contract, endpoint);

  return {
    ...capability,
    name: isDocumentTemplate ? "Document Templates" : capability.name,
    description: isDocumentTemplate
      ? "Design, preview, version and activate organisation Finance documents."
      : capability.description,
    status: "active",
    contextScope: contract.scope,
    create,
    runtime: {
      ...(capability.runtime || {}),
      renderer: "MasterDataRuntimeWorkCenter",
      listApi: endpoint,
      createApi: writable ? create.endpoint : null,
    },
    actions: contract.actions || [],
    topMenu,
    rowMenu,
    ui: {
      ...(capability.ui || {}),
      api: endpoint,
      rowsKey: "rows",
      search: contract.search || [],
      topMenu,
      rowMenu,
      nameField: contract.search?.[0] || "name",
    },
    data: {
      ...(capability.data || {}),
      capability: capability.id,
      sourceTables: contract.tables,
      primaryTable: contract.table,
      scope: contract.scope,
      readOnly: Boolean(contract.readOnly),
      mutation,
    },
  };
}

function normalizeFinanceCapability(capability) {
  const route = String(capability?.route || "");
  if (!route.startsWith("/finance/") || !capability?.id) return capability;

  capability = normalizeFinanceJournalCapability(capability);
  capability = normalizeFinanceAccessCapability(capability);

  if (capability.id === "finance_permissions") return capability;

  const closedContract = getFinanceWorkspaceContract(capability.id);
  if (closedContract) return normalizeClosedFinanceWorkspace(capability, closedContract);

  const policy = getFinancePrimaryActionPolicy(capability.id);
  if (!policy) return capability;

  const currentTopMenu = actionList(capability?.topMenu || capability?.ui?.topMenu);

  if (policy.mode === "none") {
    const topMenu = currentTopMenu.filter(
      (action) => String(action?.type || "").toLowerCase() !== "create"
    );
    return {
      ...capability,
      create: { ...(capability.create || {}), enabled: false },
      topMenu,
      ui: { ...(capability.ui || {}), topMenu },
    };
  }

  if (policy.mode === "create") {
    const explicitCreate = policy.create || null;
    const existingCreate = capability.create || null;
    const create = explicitCreate
      ? { ...(existingCreate || {}), ...explicitCreate, enabled: true }
      : existingCreate;
    if (!create || create.enabled !== true) return capability;

    const topMenu = dedupeActions([
      { id: "new", type: "create" },
      ...currentTopMenu,
    ]);
    return {
      ...capability,
      status: "active",
      create,
      topMenu,
      ui: { ...(capability.ui || {}), topMenu },
    };
  }

  if (policy.mode === "action") {
    const operationalAction = normalizeOperationalAction(
      capability.id,
      resolveFinanceOperationalAction(capability.id)
    );
    if (!operationalAction) return capability;

    const topMenu = dedupeActions([
      operationalAction,
      ...currentTopMenu.filter(
        (action) => String(action?.type || "").toLowerCase() !== "create"
      ),
    ]);
    return {
      ...capability,
      status: "active",
      create: { ...(capability.create || {}), enabled: false },
      topMenu,
      ui: { ...(capability.ui || {}), topMenu },
    };
  }

  return capability;
}

function hasExecutableCreate(capability) {
  const create = capability?.create;
  return Boolean(
    create?.enabled === true &&
    (create?.form || create?.schema?.length || create?.api || create?.endpoint || create?.engine)
  );
}

function hasExecutableAction(capability) {
  return actionList(
    capability?.topMenu || capability?.ui?.topMenu || capability?.actions
  ).some(
    (action) =>
      action?.endpoint ||
      action?.api ||
      action?.engine ||
      action?.type === "report"
  );
}

function applyFinanceRuntimeManifest(capability) {
  const route = String(capability?.route || "");
  const runtimeDefinition = financeRuntimeManifest[capability?.id];
  if (!runtimeDefinition || !route.startsWith("/finance/")) return capability;

  const contract = getFinanceWorkspaceContract(capability.id);
  const configuredApi =
    runtimeDefinition.api ||
    capability?.ui?.api ||
    capability?.runtime?.listApi ||
    null;
  const hasEvidence = Boolean(
    configuredApi ||
    contract ||
    hasExecutableCreate(capability) ||
    hasExecutableAction(capability)
  );

  let renderer = runtimeDefinition.renderer || null;
  if (!renderer) {
    if (runtimeDefinition.kind === "report") {
      renderer = configuredApi
        ? "FinanceReportRuntimeWorkCenter"
        : "ReportWorkCenter";
    } else if (runtimeDefinition.kind === "process") {
      renderer = "FinanceOperationalWorkCenter";
    } else {
      renderer = "MasterDataRuntimeWorkCenter";
    }
  }

  return {
    ...capability,
    status: hasEvidence ? "active" : capability.status,
    disabled: hasEvidence ? false : capability.disabled,
    contextScope:
      runtimeDefinition.scope || capability.contextScope || "entity",
    runtimeKind: runtimeDefinition.kind,
    ownerDomain: runtimeDefinition.owner,
    runtime: {
      ...(capability.runtime || {}),
      renderer,
      ...(configuredApi ? { listApi: configuredApi } : {}),
    },
    ui: {
      ...(capability.ui || {}),
      ...(configuredApi ? { api: configuredApi } : {}),
      ...(runtimeDefinition.rowsKey
        ? { rowsKey: runtimeDefinition.rowsKey }
        : {}),
    },
  };
}

export function serializeCapability(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "function") return null;
  if (Array.isArray(value)) return value.map(serializeCapability);

  if (typeof value === "object") {
    const serialized = Object.fromEntries(
      Object.entries(value)
        .map(([key, val]) => [key, serializeCapability(val)])
        .filter(([, val]) => val !== undefined)
    );
    return applyFinanceRuntimeManifest(
      normalizeFinanceCapability(serialized)
    );
  }

  return value;
}
