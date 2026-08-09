import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { fulfillSalesOrder } from "@/lib/inventory/fulfillment/fulfillSalesOrder";
import createCustomerInvoice from "@/lib/finance/accounts-receivable/documents/createCustomerInvoice";

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function actorId(access = {}) {
  return (
    access.access?.staffAccountId ||
    access.staff?.id ||
    access.user?.id ||
    null
  );
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function paymentTermDays(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized || normalized === "DUE ON RECEIPT" || normalized === "COD") {
    return 0;
  }
  const match = normalized.match(/(\d+)/);
  return match ? Math.max(0, Number(match[1])) : 30;
}

export async function fulfillAndInvoiceSalesOrder({
  access,
  body = {},
  organizationId,
  request,
}) {
  const entityId = text(
    body.entityId || body.entity_id || body.legalEntityId || body.legal_entity_id
  );
  const salesOrderId = text(
    body.salesOrderId || body.sales_order_id || body.orderId || body.order_id
  );
  const idempotencyKey =
    text(body.idempotencyKey || body.idempotency_key) ||
    request?.headers?.get?.("idempotency-key");

  if (!entityId) throw Object.assign(new Error("entity_id required"), { status: 400 });
  if (!salesOrderId) {
    throw Object.assign(new Error("sales_order_id required"), { status: 400 });
  }
  if (!idempotencyKey) {
    throw Object.assign(new Error("idempotency_key required"), { status: 400 });
  }

  const orderResult = await supabaseAdmin
    .from("sales_orders")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("id", salesOrderId)
    .maybeSingle();
  if (orderResult.error) throw orderResult.error;
  const order = orderResult.data;
  if (!order) {
    throw Object.assign(new Error("Sales order not found in organization and entity scope"), {
      status: 404,
    });
  }
  if (String(order.application_id || "").toLowerCase() === "retail") {
    throw Object.assign(
      new Error("Retail sales orders use the payment-before-fulfillment flow"),
      { status: 409 }
    );
  }

  const partyId = order.party_id || order.customer_id;
  if (!partyId) {
    throw Object.assign(new Error("Sales order customer Party is missing"), {
      status: 409,
    });
  }

  const lineResult = await supabaseAdmin
    .from("sales_order_lines")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("sales_order_id", salesOrderId)
    .order("line_number", { ascending: true });
  if (lineResult.error) throw lineResult.error;
  const orderLines = lineResult.data || [];
  if (!orderLines.length) {
    throw Object.assign(new Error("Sales order has no invoiceable lines"), {
      status: 409,
    });
  }

  const profileResult = await supabaseAdmin
    .from("customer_profiles")
    .select("payment_terms")
    .eq("organization_id", organizationId)
    .eq("party_id", partyId)
    .maybeSingle();
  if (profileResult.error) throw profileResult.error;

  const fulfillment = await fulfillSalesOrder({
    access,
    body: {
      ...body,
      entity_id: entityId,
      sales_order_id: salesOrderId,
      idempotency_key: idempotencyKey,
    },
    organizationId,
    request,
  });

  const invoiceDate = new Date().toISOString().slice(0, 10);
  const requestedDueDate = text(body.dueDate || body.due_date);
  const dueDate =
    requestedDueDate ||
    addDays(invoiceDate, paymentTermDays(profileResult.data?.payment_terms));

  const invoiceLines = orderLines.map((line) => {
    const quantity = Number(line.quantity || 0);
    const lineSubtotal = Number(line.line_subtotal || 0);
    return {
      description: line.description || line.item_name || line.sku || "Sales order item",
      quantity,
      unit_price: quantity > 0 ? lineSubtotal / quantity : 0,
      tax_amount: Number(line.tax_amount || 0),
    };
  });

  const invoice = await createCustomerInvoice({
    organization_id: organizationId,
    entity_id: entityId,
    party_id: partyId,
    invoice_date: invoiceDate,
    due_date: dueDate,
    currency_code: order.currency_code,
    exchange_rate: 1,
    lines: invoiceLines,
    tax_amount: Number(order.tax_amount || 0),
    notes: order.notes || `Sales Order ${order.order_number || salesOrderId}`,
    created_by: actorId(access),
    idempotency_key: `${idempotencyKey}:invoice`,
    document_prefix: "INV",
    source_document_type: "SALES_ORDER",
    source_document_id: salesOrderId,
  });

  return {
    success: true,
    organization_id: organizationId,
    entity_id: entityId,
    sales_order_id: salesOrderId,
    party_id: partyId,
    fulfillment,
    invoice,
  };
}

export default fulfillAndInvoiceSalesOrder;
