import { getForm } from "@/lib/platform/forms";

const DISABLED_STATUSES = new Set([
  "disabled",
  "planned",
  "unavailable",
  "coming-soon",
  "coming_soon",
]);

export function normalizeActionType(action = {}) {
  return String(
    action?.type ||
    action?.action ||
    action?.id ||
    ""
  )
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
}

export function hasActionExecutionTarget(action = {}) {
  return Boolean(
    action?.endpoint ||
    action?.api ||
    action?.url ||
    action?.href ||
    action?.engine ||
    (
      action?.capability &&
      action?.action
    )
  );
}

export function hasUsableCreateAction(createAction = {}) {
  if (createAction?.enabled !== true) {
    return false;
  }

  return Boolean(
    createAction?.schema?.length ||
    (
      createAction?.form &&
      getForm(createAction.form).length > 0
    ) ||
    (
      createAction?.engine &&
      createAction.engine !== "create"
    ) ||
    createAction?.endpoint ||
    createAction?.api ||
    (
      createAction?.capability &&
      createAction?.action
    )
  );
}

function hasDocumentExecutionTarget(action = {}, capability = {}) {
  return Boolean(
    action?.document ||
    action?.renderer ||
    capability?.detail?.renderer ||
    capability?.detail?.document ||
    capability?.documentRenderer
  );
}

function isDisabled(action = {}) {
  if (
    action?.enabled === false ||
    action?.disabled === true ||
    action?.hidden === true
  ) {
    return true;
  }

  const status = String(action?.status || "")
    .trim()
    .toLowerCase();

  return DISABLED_STATUSES.has(status);
}

export function isActionExecutable(
  action,
  {
    capability = {},
    createAction = capability?.create || null,
    allowCreate = false,
    allowSelect = false,
  } = {}
) {
  if (!action || typeof action !== "object") {
    return false;
  }

  if (action.type === "section") {
    return true;
  }

  if (isDisabled(action)) {
    return false;
  }

  const type = normalizeActionType(action);

  if (!type) {
    return false;
  }

  if (hasActionExecutionTarget(action)) {
    return true;
  }

  if (type === "create" || type === "create_record") {
    return Boolean(
      allowCreate ||
      hasUsableCreateAction(createAction)
    );
  }

  if (type === "open" || type === "view") {
    return hasDocumentExecutionTarget(
      action,
      capability
    );
  }

  if (type === "select") {
    return allowSelect;
  }

  if (
    (type === "edit" || type === "duplicate") &&
    hasUsableCreateAction(createAction)
  ) {
    return true;
  }

  return false;
}

export function sanitizeActionList(
  actions,
  options = {}
) {
  const list = Array.isArray(actions)
    ? actions
    : actions && typeof actions === "object"
      ? Object.entries(actions).map(
          ([id, action]) => ({
            id,
            ...(action || {}),
          })
        )
      : [];

  const seen = new Set();

  return list.filter(action => {
    if (!isActionExecutable(action, options)) {
      return false;
    }

    if (action.type === "section") {
      return true;
    }

    const key = String(
      action?.id ||
      action?.action ||
      action?.type ||
      action?.label ||
      ""
    )
      .trim()
      .toLowerCase()
      .replace(/-/g, "_");

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
