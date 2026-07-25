import {
  getFinancePrimaryActionPolicy,
  resolveFinanceOperationalAction,
} from "@/lib/finance/ui/FinancePrimaryActionPolicy";

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

function normalizeFinanceCapability(capability) {
  const route = String(capability?.route || "");

  if (!route.startsWith("/finance/") || !capability?.id) {
    return capability;
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
