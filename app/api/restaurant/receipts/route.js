export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");
    const orderId = searchParams.get("order_id") || searchParams.get("orderId");

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return Response.json(
        { success: false, error: access.error },
        { status: access.status || 403 }
      );
    }

    let orderQuery = supabaseAdmin
      .from("orders")
      .select("*, order_items(*)")
      .eq("organization_id", access.organizationId)
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
        .eq("organization_id", access.organizationId)
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
        .eq("organization_id", access.organizationId)
        .in("order_id", orderIds);

      if (allocationResult.error) {
        if (!isMissingRelation(allocationResult.error, "restaurant_payment_allocations")) {
          throw allocationResult.error;
        }
      } else {
        allocations = allocationResult.data || [];
      }
    }

    const paymentsBySession = payments.reduce((map, payment) => {
      if (!payment.session_id) return map;
      if (!map.has(payment.session_id)) map.set(payment.session_id, []);
      map.get(payment.session_id).push(payment);
      return map;
    }, new Map());

    const paymentsByOrder = allocations.reduce((map, allocation) => {
      if (!allocation.order_id || !allocation.payment_id) return map;
      const payment = payments.find((row) => row.id === allocation.payment_id);
      if (!payment) return map;
      if (!map.has(allocation.order_id)) map.set(allocation.order_id, []);
      const rows = map.get(allocation.order_id);
      if (!rows.some((row) => row.id === payment.id)) rows.push(payment);
      return map;
    }, new Map());

    const receipts = persistedOrders
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
          order_id: order.id,
          receipt_number:
            order.receipt_number ||
            order.order_number ||
            `R-${String(order.id).slice(0, 8).toUpperCase()}`,
          table_number: order.table_number || null,
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
        };
      })
      .filter((receipt) => orderId || receipt.status === "PAID");

    return Response.json({
      success: true,
      receipts,
      receipt: orderId ? receipts[0] || null : null,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Unable to load receipts" },
      { status: 500 }
    );
  }
}
