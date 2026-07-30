import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function requireValue(value, name) {
  if (value === null || value === undefined || value === "") {
    throw new Error(`${name} required`);
  }

  return value;
}

function normalizedGuests(value) {
  const guests = Number(value);

  if (!Number.isInteger(guests) || guests < 0) {
    throw new Error("guestCount must be a non-negative integer");
  }

  return guests;
}

function normalizedTableIds(value) {
  const ids = Array.isArray(value) ? value : value ? [value] : [];
  const normalized = ids.filter(Boolean).map(String);

  if (!normalized.length) {
    throw new Error("targetTableIds required");
  }

  if (new Set(normalized).size !== normalized.length) {
    throw new Error("targetTableIds must be unique");
  }

  return normalized;
}

function atomicUnavailable(error, functionName) {
  return (
    error?.code === "PGRST202" ||
    new RegExp(functionName, "i").test(error?.message || "")
  );
}

async function executeAtomic(functionName, parameters) {
  const result = await supabaseAdmin.rpc(functionName, parameters);

  if (result.error) {
    if (atomicUnavailable(result.error, functionName)) {
      const error = new Error(
        `Atomic restaurant table command is not deployed: ${functionName}`
      );
      error.status = 503;
      throw error;
    }

    throw result.error;
  }

  return result.data || {};
}

async function moveGuests({ organizationId, payload }) {
  const tableId = requireValue(payload.tableId, "tableId");
  const guestCount = normalizedGuests(payload.guestCount);

  return executeAtomic("restaurant_set_guest_count_atomic", {
    p_organization_id: organizationId,
    p_table_id: tableId,
    p_guest_count: guestCount,
    p_actor_id: payload.authenticatedStaffId || null,
  });
}

async function closeTable({ organizationId, payload }) {
  const tableId = requireValue(payload.tableId, "tableId");

  return executeAtomic("restaurant_close_table_atomic", {
    p_organization_id: organizationId,
    p_table_id: tableId,
    p_actor_id: payload.authenticatedStaffId || null,
  });
}

async function transferTable({ organizationId, payload }) {
  const fromTableId = requireValue(payload.fromTableId, "fromTableId");
  const toTableId = requireValue(payload.toTableId, "toTableId");

  if (fromTableId === toTableId) {
    throw new Error("Cannot transfer a table into itself");
  }

  return executeAtomic("restaurant_transfer_table_atomic", {
    p_organization_id: organizationId,
    p_from_table_id: fromTableId,
    p_to_table_id: toTableId,
    p_actor_id: payload.authenticatedStaffId || null,
  });
}

async function mergeTables({ organizationId, payload }) {
  const masterTableId = requireValue(payload.masterTableId, "masterTableId");
  const targetTableIds = normalizedTableIds(
    payload.targetTableIds || payload.targetTableId
  );

  if (targetTableIds.includes(String(masterTableId))) {
    throw new Error("Cannot merge a table into itself");
  }

  return executeAtomic("restaurant_merge_table_group_atomic", {
    p_organization_id: organizationId,
    p_master_table_id: masterTableId,
    p_target_table_ids: targetTableIds,
    p_actor_id: payload.authenticatedStaffId || null,
  });
}

export function validateTableCommand(command, { payload }) {
  if (!payload || typeof payload !== "object") {
    throw new Error("payload required");
  }

  if (!command) throw new Error("table command required");
  return true;
}

export function authorizeTableCommand({ context }) {
  if (!context?.actor?.id) {
    throw new Error("Authenticated actor required");
  }

  return true;
}

export async function executeTableCommand(command, { context, payload }) {
  const organizationId = context.organizationId;
  const canonicalPayload = {
    ...payload,
    authenticatedStaffId:
      context.actor?.staffAccountId || payload.authenticatedStaffId || null,
    authenticatedStaffName:
      context.actor?.email || payload.authenticatedStaffName || null,
  };

  if (command === "MOVE_GUESTS") {
    return moveGuests({ organizationId, payload: canonicalPayload });
  }

  if (command === "CLOSE_TABLE") {
    return closeTable({ organizationId, payload: canonicalPayload });
  }

  if (command === "TRANSFER_TABLE") {
    return transferTable({ organizationId, payload: canonicalPayload });
  }

  if (command === "MERGE_TABLES") {
    return mergeTables({ organizationId, payload: canonicalPayload });
  }

  throw new Error(`Unsupported table command: ${command}`);
}
