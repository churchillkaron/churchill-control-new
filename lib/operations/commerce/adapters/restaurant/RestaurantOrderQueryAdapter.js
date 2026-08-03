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

export async function listRestaurantOrders({ organizationId }) {
  const [tablesResult, ordersResult] = await Promise.all([
    supabaseAdmin
      .from("restaurant_tables")
      .select("id, table_number, table_name, status")
      .eq("organization_id", organizationId),
    supabaseAdmin
      .from("orders")
      .select("*, order_items(*)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (tablesResult.error) throw tablesResult.error;
  if (ordersResult.error) throw ordersResult.error;

  const tableById = new Map(
    (tablesResult.data || []).map((table) => [table.id, table])
  );

  return (ordersResult.data || []).map((order) => {
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

    return {
      ...order,
      application_id: "restaurant",
      context,
      items: Array.isArray(order.order_items) ? order.order_items : [],
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
