import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value) {
  return Number(numeric(value).toFixed(2));
}

function isMissingRelation(error, relation) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    message.includes(String(relation || "").toLowerCase())
  );
}

function receiptContext(order) {
  const reference = order.table_number || null;
  return {
    type: "service_location",
    id: order.table_id || null,
    reference: reference == null ? null : String(reference),
    label: reference == null ? "Unassigned service location" : `Table ${reference}`,
  };
}

export async function listRestaurantReceipts({ organizationId, orderId }) {
  let orderQuery = supabaseAdmin
    .from("orders")
    .select("*, order_items(*)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(250);

  if (orderId) orderQuery = orderQuery.eq("id", orderId);

  const { data: orders, error: orderError } = await orderQuery;
  if (orderError) throw orderError;

  const persistedOrders = orders || [];
  const orderIds = persistedOrders.map((order) => order.id).filter(Boolean);
  const sessionIds = [
    ...new Set(persistedOrders.map((order) => order.session_id).filter(Boolean)),
  ];

  let payments = [];
  if (sessionIds.length) {
    const paymentResult = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("organization_id", organizationId)
      .in("session_id", sessionIds)
      .order("created_at", { ascending: true });

    if (paymentResult.error) throw paymentResult.error;
    payments = paymentResult.data || [];
  }

  let allocations = [];
  if (orderIds.length) {
    const allocationResult = await supabaseAdmin
      .from("restaurant_payment_allocations")
      .select("payment_id, order_id, amount, allocation_type")
      .eq("organization_id", organizationId)
      .in("order_id", orderIds);

    if (allocationResult.error) {
      if (!isMissingRelation(allocationResult.error, "restaurant_payment_allocations")) {
        throw allocationResult.error;
      }
    } else {
      allocations = allocationResult.data || [];
    }
  }

  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
  const paymentsBySession = new Map();
  for (const payment of payments) {
    if (!payment.session_id) continue;
    if (!paymentsBySession.has(payment.session_id)) {
      paymentsBySession.set(payment.session_id, []);
    }
    paymentsBySession.get(payment.session_id).push(payment);
  }

  const paymentsByOrder = new Map();
  for (const allocation of allocations) {
    const payment = paymentById.get(allocation.payment_id);
    if (!payment || !allocation.order_id) continue;
    if (!paymentsByOrder.has(allocation.order_id)) {
      paymentsByOrder.set(allocation.order_id, []);
    }
    const rows = paymentsByOrder.get(allocation.order_id);
    if (!rows.some((row) => row.id === payment.id)) rows.push(payment);
  }

  return persistedOrders
    .map((order) => {
      const orderPayments =
        paymentsByOrder.get(order.id) ||
        paymentsBySession.get(order.session_id) ||
        [];
      const total = round(order.total_amount ?? order.total);
      const paid = round(
        orderPayments
          .filter((payment) => String(payment.status || "").toUpperCase() !== "VOID")
          .reduce((sum, payment) => sum + numeric(payment.amount), 0)
      );
      const isPaid =
        paid >= total - 0.01 ||
        ["PAID", "CLOSED", "COMPLETED"].includes(
          String(order.status || "").toUpperCase()
        );

      return {
        application_id: "restaurant",
        order_id: order.id,
        receipt_number:
          order.receipt_number ||
          order.order_number ||
          `R-${String(order.id).slice(0, 8).toUpperCase()}`,
        context: receiptContext(order),
        created_at: order.paid_at || order.updated_at || order.created_at,
        status: isPaid ? "PAID" : order.status || "OPEN",
        items: (order.order_items || []).map((item) => ({
          ...item,
          total: round(numeric(item.price) * numeric(item.quantity || 1)),
        })),
        subtotal: round(order.subtotal),
        discount: round(order.discount_amount),
        tax: round(order.vat_amount ?? order.tax_amount),
        service_charge: round(order.service_charge_amount),
        total,
        paid,
        remaining: Math.max(0, round(total - paid)),
        payment_breakdown: orderPayments,
        table_number: order.table_number || null,
      };
    })
    .filter((receipt) => orderId || receipt.status === "PAID");
}

const RestaurantReceiptAdapter = Object.freeze({
  listReceipts: listRestaurantReceipts,
});

export default RestaurantReceiptAdapter;
