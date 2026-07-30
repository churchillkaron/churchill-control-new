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
      .select("*, order_items(*)")
      .in("table_id", tableIds)
      .in("status", ACTIVE_ORDER_STATUSES)
      .order("created_at", { ascending: true })
  );

  if (result.error) throw result.error;
  return result.data || [];
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

  const [sourceTable, destinationTable] = await Promise.all([
    loadTable(organizationId, fromTableId),
    loadTable(organizationId, toTableId),
  ]);

  if (String(destinationTable.status || "").toUpperCase() === "MERGED") {
    throw new Error("Destination table is merged into another table");
  }

  const now = new Date().toISOString();

  const orderMove = await scoped(
    organizationId,
    supabaseAdmin
      .from("orders")
      .update({
        table_id: toTableId,
        table_number:
          destinationTable.table_number || destinationTable.table_name || null,
        updated_at: now,
      })
      .eq("table_id", fromTableId)
      .in("status", ACTIVE_ORDER_STATUSES)
  );

  if (orderMove.error) throw orderMove.error;

  const sessionMove = await scoped(
    organizationId,
    supabaseAdmin
      .from("table_sessions")
      .update({
        table_id: toTableId,
        table_number:
          destinationTable.table_number || destinationTable.table_name || null,
        updated_at: now,
      })
      .eq("table_id", fromTableId)
      .neq("status", "CLOSED")
  );

  if (sessionMove.error) throw sessionMove.error;

  const totalGuests =
    Number(sourceTable.current_guests || 0) +
    Number(destinationTable.current_guests || 0);

  await updateTable(organizationId, toTableId, {
    status: totalGuests > 0 ? "OCCUPIED" : "AVAILABLE",
    current_guests: totalGuests,
    active_session_id:
      destinationTable.active_session_id || sourceTable.active_session_id || null,
  });

  await updateTable(organizationId, fromTableId, {
    status: "AVAILABLE",
    current_guests: 0,
    active_session_id: null,
  });

  return {
    fromTableId,
    toTableId,
    guestsMoved: Number(sourceTable.current_guests || 0),
  };
}

async function mergeTables({ organizationId, payload }) {
  const masterTableId = requireValue(payload.masterTableId, "masterTableId");
  const mergedTableId = requireValue(payload.targetTableId, "targetTableId");

  if (masterTableId === mergedTableId) {
    throw new Error("Cannot merge a table into itself");
  }

  const [masterTable, mergedTable] = await Promise.all([
    loadTable(organizationId, masterTableId),
    loadTable(organizationId, mergedTableId),
  ]);
  const now = new Date().toISOString();
  const openOrders = await loadActiveOrders(organizationId, [
    masterTableId,
    mergedTableId,
  ]);

  let masterOrder =
    openOrders.find((order) => order.table_id === masterTableId) || null;

  if (!masterOrder && openOrders.length) {
    masterOrder = openOrders[0];

    const movedMaster = await scoped(
      organizationId,
      supabaseAdmin
        .from("orders")
        .update({
          table_id: masterTableId,
          table_number: masterTable.table_number || masterTable.table_name || null,
          status: "OPEN",
          updated_at: now,
        })
        .eq("id", masterOrder.id)
    );

    if (movedMaster.error) throw movedMaster.error;
  }

  if (!masterOrder) {
    const created = await supabaseAdmin
      .from("orders")
      .insert({
        organization_id: organizationId,
        table_id: masterTableId,
        table_number: masterTable.table_number || masterTable.table_name || null,
        session_id:
          masterTable.active_session_id || mergedTable.active_session_id || null,
        total: 0,
        total_amount: 0,
        status: "OPEN",
        staff_id: payload.authenticatedStaffId || null,
        staff_name: payload.authenticatedStaffName || null,
        created_at: now,
      })
      .select("*")
      .single();

    if (created.error) throw created.error;
    masterOrder = created.data;
  }

  const sourceOrders = openOrders.filter(
    (order) => order.id !== masterOrder.id
  );
  const sourceOrderIds = sourceOrders.map((order) => order.id);
  const itemIds = sourceOrders.flatMap((order) =>
    (order.order_items || []).map((item) => item.id)
  );

  if (itemIds.length) {
    const itemMove = await scoped(
      organizationId,
      supabaseAdmin
        .from("order_items")
        .update({
          order_id: masterOrder.id,
          updated_at: now,
        })
        .in("id", itemIds)
    );

    if (itemMove.error) throw itemMove.error;
  }

  if (sourceOrderIds.length) {
    const sourceClose = await scoped(
      organizationId,
      supabaseAdmin
        .from("orders")
        .update({
          status: "CLOSED",
          total: 0,
          total_amount: 0,
          updated_at: now,
        })
        .in("id", sourceOrderIds)
    );

    if (sourceClose.error) throw sourceClose.error;
  }

  const masterItems = await scoped(
    organizationId,
    supabaseAdmin
      .from("order_items")
      .select("price,quantity")
      .eq("order_id", masterOrder.id)
  );

  if (masterItems.error) throw masterItems.error;

  const masterTotal = (masterItems.data || []).reduce(
    (sum, item) =>
      sum + Number(item.price || 0) * Number(item.quantity || 1),
    0
  );

  const masterOrderUpdate = await scoped(
    organizationId,
    supabaseAdmin
      .from("orders")
      .update({
        table_id: masterTableId,
        table_number: masterTable.table_number || masterTable.table_name || null,
        total: masterTotal,
        total_amount: masterTotal,
        status: "OPEN",
        updated_at: now,
      })
      .eq("id", masterOrder.id)
  );

  if (masterOrderUpdate.error) throw masterOrderUpdate.error;

  const sessionMove = await scoped(
    organizationId,
    supabaseAdmin
      .from("table_sessions")
      .update({
        table_id: masterTableId,
        table_number: masterTable.table_number || masterTable.table_name || null,
        updated_at: now,
      })
      .eq("table_id", mergedTableId)
      .neq("status", "CLOSED")
  );

  if (sessionMove.error) throw sessionMove.error;

  const mergeDelete = await scoped(
    organizationId,
    supabaseAdmin
      .from("restaurant_table_merges")
      .delete()
      .eq("merged_table_id", mergedTableId)
  );

  if (mergeDelete.error) throw mergeDelete.error;

  const mergeInsert = await supabaseAdmin
    .from("restaurant_table_merges")
    .insert({
      organization_id: organizationId,
      master_table_id: masterTableId,
      merged_table_id: mergedTableId,
    });

  if (mergeInsert.error) throw mergeInsert.error;

  const totalGuests =
    Number(masterTable.current_guests || 0) +
    Number(mergedTable.current_guests || 0);

  await updateTable(organizationId, masterTableId, {
    status: totalGuests > 0 ? "OCCUPIED" : "AVAILABLE",
    current_guests: totalGuests,
    active_session_id:
      masterTable.active_session_id || mergedTable.active_session_id || null,
  });

  await updateTable(organizationId, mergedTableId, {
    status: "MERGED",
    current_guests: 0,
    active_session_id: null,
  });

  return {
    masterTableId,
    mergedTableId,
    masterOrderId: masterOrder.id,
    movedItems: itemIds.length,
    closedOrders: sourceOrderIds.length,
  };
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
