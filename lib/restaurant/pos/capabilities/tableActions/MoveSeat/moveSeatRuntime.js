import { supabaseAdmin } from "@/lib/shared/supabase/admin";

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
  if (value === null || value === undefined || value === "") {
    throw new Error(`${name} required`);
  }

  return value;
}

function seatOf(item) {
  return (
    item?.seat_position ??
    item?.seat_number ??
    item?.modifiers?.seat ??
    null
  );
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

async function recalculateOrder(organizationId, orderId) {
  const itemsResult = await scoped(
    organizationId,
    supabaseAdmin
      .from("order_items")
      .select("price,quantity")
      .eq("order_id", orderId)
  );

  if (itemsResult.error) throw itemsResult.error;

  const total = (itemsResult.data || []).reduce(
    (sum, item) =>
      sum + Number(item.price || 0) * Number(item.quantity || 1),
    0
  );

  const orderResult = await scoped(
    organizationId,
    supabaseAdmin
      .from("orders")
      .update({
        total,
        total_amount: total,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
  );

  if (orderResult.error) throw orderResult.error;

  return total;
}

export function validate({ payload }) {
  requireValue(payload?.fromTableId, "fromTableId");
  requireValue(payload?.toTableId, "toTableId");
  requireValue(payload?.seatPosition, "seatPosition");

  if (payload.fromTableId === payload.toTableId) {
    throw new Error("Cannot move a seat to the same table");
  }

  return true;
}

export function authorize({ context }) {
  if (!context?.actor?.id) {
    throw new Error("Authenticated actor required");
  }

  return true;
}

export async function execute({ context, payload }) {
  const organizationId = context.organizationId;
  const fromTableId = payload.fromTableId;
  const toTableId = payload.toTableId;
  const seatPosition = payload.seatPosition;

  const [sourceTable, targetTable] = await Promise.all([
    loadTable(organizationId, fromTableId),
    loadTable(organizationId, toTableId),
  ]);

  if (String(targetTable.status || "").toUpperCase() === "MERGED") {
    throw new Error("Target table is merged into another table");
  }

  const sourceOrdersResult = await scoped(
    organizationId,
    supabaseAdmin
      .from("orders")
      .select("*, order_items(*)")
      .eq("table_id", fromTableId)
      .in("status", ACTIVE_ORDER_STATUSES)
      .order("created_at", { ascending: true })
  );

  if (sourceOrdersResult.error) throw sourceOrdersResult.error;

  const seatItems = (sourceOrdersResult.data || [])
    .flatMap((order) =>
      (order.order_items || []).map((item) => ({
        ...item,
        source_order_id: order.id,
      }))
    )
    .filter((item) => String(seatOf(item)) === String(seatPosition));

  if (!seatItems.length) {
    throw new Error(`No active order items found for seat ${seatPosition}`);
  }

  const targetOrderResult = await scoped(
    organizationId,
    supabaseAdmin
      .from("orders")
      .select("*")
      .eq("table_id", toTableId)
      .in("status", ACTIVE_ORDER_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1)
  ).maybeSingle();

  if (targetOrderResult.error) throw targetOrderResult.error;

  let targetOrder = targetOrderResult.data;

  if (!targetOrder) {
    const created = await supabaseAdmin
      .from("orders")
      .insert({
        organization_id: organizationId,
        table_id: toTableId,
        table_number: targetTable.table_number || targetTable.table_name || null,
        session_id:
          targetTable.active_session_id || sourceTable.active_session_id || null,
        total: 0,
        total_amount: 0,
        status: "OPEN",
        staff_id: context.actor?.staffAccountId || null,
        staff_name: context.actor?.email || null,
        created_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (created.error) throw created.error;
    targetOrder = created.data;
  }

  const itemIds = seatItems.map((item) => item.id);
  const sourceOrderIds = [
    ...new Set(seatItems.map((item) => item.source_order_id)),
  ];

  const moveResult = await scoped(
    organizationId,
    supabaseAdmin
      .from("order_items")
      .update({
        order_id: targetOrder.id,
        updated_at: new Date().toISOString(),
      })
      .in("id", itemIds)
  );

  if (moveResult.error) throw moveResult.error;

  const sourceTotals = {};

  for (const orderId of sourceOrderIds) {
    sourceTotals[orderId] = await recalculateOrder(
      organizationId,
      orderId
    );
  }

  const targetTotal = await recalculateOrder(
    organizationId,
    targetOrder.id
  );

  return {
    fromTableId,
    toTableId,
    seatPosition,
    movedItems: itemIds.length,
    sourceOrderIds,
    sourceTotals,
    targetOrderId: targetOrder.id,
    targetTotal,
  };
}
