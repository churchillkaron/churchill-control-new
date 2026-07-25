import {
  getFinancePrimaryActionPolicy,
  resolveFinanceOperationalAction,
} from "@/lib/finance/ui/FinancePrimaryActionPolicy";
import {
  getFinanceWorkspaceContract,
} from "@/lib/finance/workspaces/FinanceWorkspaceContracts";

function actionList(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === "object") {
    return Object.entries(value).map(
      ([id, action]) => ({
        id,
        ...(action || {}),
      })
    );
  }

  return [];
}

function dedupeActions(actions) {
  const seen = new Set();

  return actionList(actions).filter(action => {
    const key = String(
      action?.id ||
      action?.type ||
      action?.label ||
      ""
    )
      .trim()
      .toLowerCase();

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function normalizeOperationalAction(
  capabilityId,
  action
) {
  if (!action) {
    return null;
  }

  if (capabilityId === "bank_reconciliation") {
    return {
      ...action,
      method: "PUT",
    };
  }

  return action;
}

function createLabel(capability, contract) {
  if (contract.singleton) {
    return `Configure ${capability.name}`;
  }

  const singular = String(capability.document || capability.name || "Record")
    .replace(/([a-z])([A-Z])/g, "$1 $2");

  return `+ ${singular}`;
}

function normalizeClosedFinanceWorkspace(capability, contract) {
  const writable = !contract.readOnly && Array.isArray(contract.schema) && contract.schema.length > 0;
  const endpoint = `/api/finance/workspaces/${capability.id}`;
  const create = writable
    ? {
        enabled: true,
        id: capability.id,
        engine: "create",
        type: "document",
        schema: contract.schema,
        api: endpoint,
        endpoint,
        label: createLabel(capability, contract),
        title: contract.singleton
          ? `Configure ${capability.name}`
          : `New ${capability.document || capability.name}`,
      }
    : {
        ...(capability.create || {}),
        enabled: false,
      };
  const topMenu = dedupeActions([
    ...(writable ? [{ id: "new", type: "create", label: create.label }] : []),
    ...(contract.actions || []),
  ]);
  const rowMenu = [
    { id: "open", type: "open" },
    { id: "history", type: "history" },
  ];

  return {
    ...capability,
    status: "active",
    contextScope: contract.scope,
    create,
    runtime: {
      ...(capability.runtime || {}),
      renderer: "MasterDataRuntimeWorkCenter",
      listApi: endpoint,
      createApi: writable ? endpoint : null,
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
    },
  };
}

function normalizeFinanceCapability(capability) {
  const route = String(capability?.route || "");

  if (!route.startsWith("/finance/") || !capability?.id) {
    return capability;
  }

  const closedContract = getFinanceWorkspaceContract(capability.id);

  if (closedContract) {
    return normalizeClosedFinanceWorkspace(
      capability,
      closedContract
    );
  }

  const policy = getFinancePrimaryActionPolicy(capability.id);

  if (!policy) {
    return capability;
  }

  const currentTopMenu = actionList(
    capability?.topMenu ||
    capability?.ui?.topMenu
  );

  if (policy.mode === "none") {
    const topMenu = currentTopMenu.filter(
      action => String(action?.type || "").toLowerCase() !== "create"
    );
    return {
      ...capability,
      create: {
        ...(capability.create || {}),
        enabled: false,
      },
      topMenu,
      ui: {
        ...(capability.ui || {}),
        topMenu,
      },
    };
  }

  if (policy.mode === "create") {
    const explicitCreate = policy.create || null;
    const existingCreate = capability.create || null;
    const create = explicitCreate
      ? {
          ...(existingCreate || {}),
          ...explicitCreate,
          enabled: true,
        }
      : existingCreate;

    if (!create || create.enabled !== true) {
      return capability;
    }

    const topMenu = dedupeActions([
      { id: "new", type: "create" },
      ...currentTopMenu,
    ]);

    return {
      ...capability,
      create,
      topMenu,
      ui: {
        ...(capability.ui || {}),
        topMenu,
      },
    };
  }

  if (policy.mode === "action") {
    const operationalAction = normalizeOperationalAction(
      capability.id,
      resolveFinanceOperationalAction(
        capability.id
      )
    );

    if (!operationalAction) {
      return capability;
    }

    const topMenu = dedupeActions([
      operationalAction,
      ...currentTopMenu.filter(
        action => String(action?.type || "").toLowerCase() !== "create"
      ),
    ]);

    return {
      ...capability,
      create: {
        ...(capability.create || {}),
        enabled: false,
      },
      topMenu,
      ui: {
        ...(capability.ui || {}),
        topMenu,
      },
    };
  }

  return capability;
}

export function serializeCapability(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (typeof value === "function") {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map(
      serializeCapability
    );
  }

  if (typeof value === "object") {
    const serialized = Object.fromEntries(
      Object.entries(value)
        .map(([key, val]) => [
          key,
          serializeCapability(val),
        ])
        .filter(
          ([, val]) =>
            val !== undefined
        )
    );

    return normalizeFinanceCapability(serialized);
  }

  return value;
}
