import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CLOSED_ORDER_STATUSES = new Set([
  "PAID",
  "CLOSED",
  "COMPLETED",
  "CANCELLED",
  "VOID",
]);

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusOf(value) {
  return String(value || "").trim().toUpperCase();
}

function missingRelation(error, relation) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    message.includes(String(relation || "").toLowerCase())
  );
}

function requestEntityId(request) {
  try {
    const searchParams = new URL(request?.url || "http://localhost").searchParams;
    return (
      searchParams.get("entityId") ||
      searchParams.get("entity_id") ||
      searchParams.get("legalEntityId") ||
      searchParams.get("legal_entity_id") ||
      null
    );
  } catch {
    return null;
  }
}

function resolveContext(order, table) {
  const reference =
    table?.table_number ||
    table?.table_name ||
    table?.name ||
    null;

  return {
    type: "service_location",
    id: table?.id || order.table_id || null,
    reference: reference == null ? null : String(reference),
    label: reference == null ? "Unassigned service location" : `Table ${reference}`,
  };
}

function annotateItem(item, correction) {
  const correctionType = statusOf(correction?.correction_type);
  if (!correctionType) return item;

  return {
    ...item,
    adjustment_type: correctionType,
    billable: false,
    original_total: numeric(correction?.original_amount ?? numeric(item.price) * numeric(item.quantity || 1)),
    corrected_total: numeric(correction?.corrected_amount),
    correction: {
      id: correction.id,
      type: correctionType,
      reason: correction.reason || null,
      created_at: correction.created_at || null,
      created_by: correction.created_by || null,
    },
  };
}

export async function listRestaurantOrders({ organizationId, request }) {
  const entityId = requestEntityId(request);
  if (!entityId) {
    const error = new Error("Select an active legal entity before loading restaurant orders");
    error.status = 400;
    throw error;
  }

  const [tablesResult, ordersResult] = await Promise.all([
    supabaseAdmin
      .from("restaurant_tables")
      .select("id, table_number, table_name, status")
      .eq("organization_id", organizationId),
    supabaseAdmin
      .from("orders")
      .select("*, order_items(*)")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (tablesResult.error) throw tablesResult.error;
  if (ordersResult.error) throw ordersResult.error;

  const persistedOrders = ordersResult.data || [];
  const orderIds = persistedOrders.map((order) => order.id).filter(Boolean);
  let corrections = [];

  if (orderIds.length) {
    const correctionResult = await supabaseAdmin
      .from("restaurant_order_item_corrections")
      .select("id, order_id, order_item_id, correction_type, reason, original_amount, corrected_amount, created_at, created_by")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .in("order_id", orderIds);

    if (correctionResult.error) {
      if (!missingRelation(correctionResult.error, "restaurant_order_item_corrections")) {
        throw correctionResult.error;
      }
    } else {
      corrections = correctionResult.data || [];
    }
  }

  const correctionByItemId = new Map(
    corrections.map((correction) => [correction.order_item_id, correction])
  );
  const tableById = new Map(
    (tablesResult.data || []).map((table) => [table.id, table])
  );

  return persistedOrders.map((order) => {
    const total = numeric(
      order.total_amount ?? order.total ?? order.grand_total
    );
    const paidAmount = numeric(order.amount_paid ?? order.paid_amount);
    const persistedRemaining = Number(order.remaining_balance);
    const remainingBalance = Number.isFinite(persistedRemaining)
      ? Math.max(0, persistedRemaining)
      : Math.max(0, total - paidAmount);
    const context = resolveContext(order, tableById.get(order.table_id));
    const status = statusOf(order.status) || "OPEN";
    const items = (Array.isArray(order.order_items) ? order.order_items : []).map(
      (item) => annotateItem(item, correctionByItemId.get(item.id))
    );

    return {
      ...order,
      application_id: "restaurant",
      entity_id: entityId,
      context,
      items,
      total,
      total_amount: total,
      paid_amount: paidAmount,
      remaining_balance: Number(remainingBalance.toFixed(2)),
      payment_status:
        order.payment_status ||
        (remainingBalance <= 0 && total > 0 ? "PAID" : "UNPAID"),
      active: !CLOSED_ORDER_STATUSES.has(status),
    };
  });
}

const RestaurantOrderQueryAdapter = Object.freeze({
  listOrders: listRestaurantOrders,
});

export default RestaurantOrderQueryAdapter;
