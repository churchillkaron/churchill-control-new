const TABLE_ACTIONS = new Set([
  "MoveGuests",
  "CloseTable",
  "TransferTable",
  "MergeTables",
  "MoveSeat",
]);

function canonicalAction(action) {
  const value = String(action || "").trim();

  const aliases = {
    MOVE_GUESTS: "MoveGuests",
    CLOSE_TABLE: "CloseTable",
    TRANSFER_TABLE: "TransferTable",
    MERGE_TABLES: "MergeTables",
    MOVE_SEAT: "MoveSeat",
  };

  return aliases[value] || value;
}

export async function executePosCapability({
  organizationId,
  entityId = null,
  periodId = null,
  capability,
  action,
  payload = {},
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!capability) {
    throw new Error("capability required");
  }

  if (!action) {
    throw new Error("action required");
  }

  const response = await fetch("/api/ubte/execute", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      organizationId,
      entityId,
      periodId,
      domain: "restaurant",
      capability,
      action,
      payload,
    }),
  });

  const result = await response.json();

  if (!response.ok || result.success === false) {
    throw new Error(result.error || "POS execution failed");
  }

  return result;
}

export async function posApi(action, payload = {}, context = {}) {
  const resolvedAction = canonicalAction(action);

  if (!TABLE_ACTIONS.has(resolvedAction)) {
    throw new Error(`Unsupported POS table action: ${action}`);
  }

  const organizationId =
    context.organizationId ||
    context.organization_id ||
    payload.organizationId ||
    payload.organization_id ||
    null;

  const canonicalPayload = { ...payload };
  delete canonicalPayload.organizationId;
  delete canonicalPayload.organization_id;

  return executePosCapability({
    organizationId,
    entityId: context.entityId || context.entity_id || null,
    periodId: context.periodId || context.period_id || null,
    capability: "posTableActions",
    action: resolvedAction,
    payload: canonicalPayload,
  });
}
