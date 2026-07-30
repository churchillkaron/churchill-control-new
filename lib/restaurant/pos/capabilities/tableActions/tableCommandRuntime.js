import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { closeTableSession } from "@/lib/restaurant/services/closeTableSession";

const ACTIVE_ORDER_STATUSES = [
  "OPEN",
  "PENDING",
  "PREPARING",
  "READY",
  "SERVED",
  "BILL_REQUESTED",
  "PARTIALLY_PAID",
];

function requireValue(value, name) {
  if (!value) throw new Error(`${name} required`);
  return value;
}

function normalizedGuests(value) {
  const guests = Number(value);

  if (!Number.isInteger(guests) || guests < 0) {
    throw new Error("guestCount must be a non-negative integer");
  }

  return guests;
}

function scoped(organizationId, query) {
  return query.eq("organization_id", organizationId);
}

async function loadTable(organizationId, tableId) {
  const result = await scoped(
    organizationId,
    supabaseAdmin
      .from("restaurant_tables")
      .select("*")
      .eq("id", tableId)
  ).maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) throw new Error(`Table not found: ${tableId}`);

  return result.data;
}

async function updateTable(organizationId, tableId, values) {
  const result = await scoped(
    organizationId,
    supabaseAdmin
      .from("restaurant_tables")
      .update({
        ...values,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tableId)
  )
    .select("*")
    .single();

  if (result.error) throw result.error;
  return result.data;
}

async function loadActiveOrders(organizationId, tableIds) {
  if (!tableIds.length) return [];

  const result = await scoped(
    organizationId,
    supabaseAdmin
      .from("orders")
      .select("id")
      .in("table_id", tableIds)
      .in("status", ACTIVE_ORDER_STATUSES)
  );

  if (result.error) throw result.error;
  return result.data || [];
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
  const table = await loadTable(organizationId, tableId);

  return updateTable(organizationId, tableId, {
    current_guests: guestCount,
    status:
      guestCount > 0 || table.active_session_id
        ? "OCCUPIED"
        : "AVAILABLE",
  });
}

async function closeTable({ organizationId, payload }) {
  const tableId = requireValue(payload.tableId, "tableId");
  const table = await loadTable(organizationId, tableId);
  const activeOrders = await loadActiveOrders(organizationId, [tableId]);

  if (activeOrders.length) {
    throw new Error("Table cannot close while active or unpaid orders remain");
  }

  if (table.active_session_id) {
    const session = await closeTableSession({
      organizationId,
      sessionId: table.active_session_id,
    });

    return {
      tableId,
      sessionId: session.id,
      status: "AVAILABLE",
    };
  }

  const updatedTable = await updateTable(organizationId, tableId, {
    status: "AVAILABLE",
    current_guests: 0,
    active_session_id: null,
  });

  return {
    tableId,
    status: updatedTable.status,
  };
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
  const mergedTableId = requireValue(payload.targetTableId, "targetTableId");

  if (masterTableId === mergedTableId) {
    throw new Error("Cannot merge a table into itself");
  }

  return executeAtomic("restaurant_merge_tables_atomic", {
    p_organization_id: organizationId,
    p_master_table_id: masterTableId,
    p_merged_table_id: mergedTableId,
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
