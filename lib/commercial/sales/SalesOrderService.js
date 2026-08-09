import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import {
  actorFrom,
  numeric,
  requestedEntityId,
  resolveCommercialDocumentContext,
  text,
  uuidOrNull,
} from "./CommercialDocumentContext";

export async function createSalesOrderDraft({
  access,
  body = {},
  organizationId,
  request,
}) {
  const entityId = requestedEntityId(body, request);
  const sourceItems = Array.isArray(body.items) ? body.items : [];
  const context = await resolveCommercialDocumentContext({
    organizationId,
    entityId,
    partyId: body.partyId || body.party_id,
    sourceItems,
  });
  const actor = actorFrom(access);
  const idempotencyKey =
    text(body.idempotencyKey || body.idempotency_key) ||
    request?.headers?.get?.("idempotency-key") ||
    `sales-order-draft:${organizationId}:${entityId}:${crypto.randomUUID()}`;

  const rpcResult = await supabaseAdmin.rpc(
    "commercial_create_sales_order_draft_party_atomic",
    {
      p_organization_id: organizationId,
      p_entity_id: entityId,
      p_channel: text(body.channel) || "COMMERCIAL",
      p_application_id:
        text(body.applicationId || body.application_id) || "commercial",
      p_source_type:
        text(body.sourceType || body.source_type) || "direct_sales_order",
      p_source_reference: text(body.sourceReference || body.source_reference),
      p_party_id: context.partyId,
      p_customer_name: text(body.customerName || body.customer_name),
      p_customer_email: text(body.customerEmail || body.customer_email),
      p_customer_phone: text(body.customerPhone || body.customer_phone),
      p_currency_code: context.currencyCode,
      p_prices_include_tax: Boolean(context.financialPolicy.pricesIncludeTax),
      p_tax_code_id: uuidOrNull(context.financialPolicy.taxCodeId),
      p_tax_code: context.financialPolicy.taxCode || null,
      p_tax_rate: numeric(context.financialPolicy.taxRate, 0),
      p_items: context.lines,
      p_actor_staff_id: actor.staffId,
      p_actor_name: actor.name,
      p_notes: text(body.notes),
      p_idempotency_key: idempotencyKey,
    }
  );

  if (rpcResult.error) {
    const unavailable =
      rpcResult.error.code === "PGRST202" ||
      /commercial_create_sales_order_draft_party_atomic/i.test(
        rpcResult.error.message || ""
      );
    if (unavailable) {
      const error = new Error(
        "Canonical Commercial sales-order migration is not deployed"
      );
      error.status = 503;
      throw error;
    }
    throw rpcResult.error;
  }

  return {
    ...(rpcResult.data || {}),
    success: true,
    application_id:
      text(body.applicationId || body.application_id) || "commercial",
    entity_id: entityId,
    idempotency_key: idempotencyKey,
  };
}

export async function listSalesOrders({ organizationId, entityId, limit = 200 }) {
  if (!entityId) {
    const error = new Error("Select an active legal entity before loading sales orders");
    error.status = 400;
    throw error;
  }

  const entity = await resolveEntity({ organizationId, entityId });
  if (!entity) {
    const error = new Error(
      "Selected legal entity is outside the organization or inactive"
    );
    error.status = 403;
    throw error;
  }

  const orderResult = await supabaseAdmin
    .from("sales_orders")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(Number(limit) || 200, 500)));

  if (orderResult.error) throw orderResult.error;
  const orders = orderResult.data || [];
  const orderIds = orders.map((order) => order.id);
  let lines = [];

  if (orderIds.length) {
    const lineResult = await supabaseAdmin
      .from("sales_order_lines")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .in("sales_order_id", orderIds)
      .order("line_number", { ascending: true });
    if (lineResult.error) throw lineResult.error;
    lines = lineResult.data || [];
  }

  const linesByOrder = new Map();
  for (const line of lines) {
    const current = linesByOrder.get(line.sales_order_id) || [];
    current.push({
      ...line,
      name: line.item_name,
      price: line.unit_price,
    });
    linesByOrder.set(line.sales_order_id, current);
  }

  return orders.map((order) => ({
    ...order,
    id: order.id,
    party_id: order.party_id || order.customer_id || null,
    document_number: order.order_number || null,
    document_type: "SALES_ORDER",
    active: !["CANCELLED", "CLOSED", "FULFILLED"].includes(
      String(order.status || "").toUpperCase()
    ),
    order_items: linesByOrder.get(order.id) || [],
    items: linesByOrder.get(order.id) || [],
    total: Number(order.total_amount || 0),
    paid_amount: Number(order.paid_amount || 0),
    remaining_balance: Number(order.remaining_balance || 0),
  }));
}

export default {
  createSalesOrderDraft,
  listSalesOrders,
};
