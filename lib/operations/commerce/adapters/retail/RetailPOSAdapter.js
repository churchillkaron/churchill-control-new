import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  createSalesOrderDraft,
  listSalesOrders,
} from "@/lib/commercial/sales/SalesOrderService";
import { settleSalesOrderCash } from "@/lib/finance/payments/settleSalesOrderCash";

function readEntityId(source = {}) {
  return (
    source.entityId ||
    source.entity_id ||
    source.legalEntityId ||
    source.legal_entity_id ||
    null
  );
}

function entityIdFromRequest(request) {
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

function contextOrderId(body = {}) {
  return (
    body.salesOrderId ||
    body.sales_order_id ||
    body.orderId ||
    body.order_id ||
    body.context?.id ||
    null
  );
}

async function createOrder({ access, body, organizationId, request }) {
  return createSalesOrderDraft({
    access,
    body: {
      ...body,
      applicationId: "retail",
      channel: body.channel || "POS",
      sourceType: body.sourceType || body.source_type || "point_of_sale",
    },
    organizationId,
    request,
  });
}

async function listOrders({ access, organizationId, request }) {
  const entityId =
    entityIdFromRequest(request) ||
    readEntityId(access) ||
    readEntityId(access?.access || {});

  return listSalesOrders({ organizationId, entityId });
}

async function listPayableContexts({ access, organizationId, request }) {
  const entityId =
    entityIdFromRequest(request) ||
    readEntityId(access) ||
    readEntityId(access?.access || {});
  const orders = await listSalesOrders({ organizationId, entityId });

  return orders
    .filter(
      (order) =>
        String(order.status || "").toUpperCase() === "CONFIRMED" &&
        String(order.fulfillment_status || "").toUpperCase() === "RESERVED" &&
        String(order.payment_status || "").toUpperCase() === "UNPAID" &&
        Number(order.remaining_balance || 0) > 0
    )
    .map((order) => ({
      context: {
        type: "sale",
        id: order.id,
        reference: order.order_number || order.id,
        label: order.order_number || `Sale ${String(order.id).slice(0, 8)}`,
      },
      order_ids: [order.id],
      order_count: 1,
      remaining_balance: Number(order.remaining_balance || 0),
      currency: order.currency_code,
      entity_id: entityId,
    }));
}

async function loadPaymentState({ body, access, organizationId }) {
  const entityId =
    readEntityId(body) ||
    readEntityId(access) ||
    readEntityId(access?.access || {});
  const salesOrderId = contextOrderId(body);

  if (!entityId || !salesOrderId) {
    const error = new Error("entity_id and sales_order_id required");
    error.status = 400;
    throw error;
  }

  const orders = await listSalesOrders({ organizationId, entityId });
  const order = orders.find((candidate) => candidate.id === salesOrderId);
  if (!order) {
    const error = new Error("Retail sales order not found");
    error.status = 404;
    throw error;
  }

  const shiftResult = await supabaseAdmin
    .from("pos_shifts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("application_id", "retail")
    .in("status", ["OPEN", "ACTIVE"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (shiftResult.error && shiftResult.error.code !== "PGRST116") {
    throw shiftResult.error;
  }

  return {
    application_id: "retail",
    entity_id: entityId,
    context: {
      type: "sale",
      id: order.id,
      reference: order.order_number || order.id,
      label: order.order_number || `Sale ${String(order.id).slice(0, 8)}`,
    },
    orders: [order],
    items: (order.items || []).map((line) => ({
      ...line,
      fully_paid: false,
      remaining_amount: Number(line.line_total || 0),
    })),
    total: Number(order.total_amount || 0),
    paidAmount: Number(order.paid_amount || 0),
    remainingBalance: Number(order.remaining_balance || 0),
    currency_code: order.currency_code,
    settlement: {
      mode: "full_cash",
      partial_allowed: false,
      item_selection_allowed: false,
      payment_methods: ["CASH"],
      cash_session_required: true,
      cash_session_id: shiftResult.data?.id || null,
      ready: Boolean(shiftResult.data),
      blocker: shiftResult.data
        ? null
        : "Open a retail cash session for the selected legal entity",
    },
  };
}

async function settlePayment({ body, access, organizationId, partial }) {
  try {
    const result = await settleSalesOrderCash({
      access,
      body: {
        ...body,
        applicationId: "retail",
        partial: Boolean(partial),
      },
      organizationId,
    });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Retail settlement failed" },
      { status: error?.status || 500 }
    );
  }
}

const RetailPOSAdapter = Object.freeze({
  id: "retail",
  contextSchema: Object.freeze({
    type: "sale",
    requiresContext: false,
    requiresItemSeat: false,
  }),
  createOrder,
  listOrders,
  listPayableContexts,
  loadPaymentState,
  settlePayment,
});

export default RetailPOSAdapter;
