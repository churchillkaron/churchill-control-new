import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { resolvePOSFinancialPolicy } from "@/lib/pos/runtime/resolvePOSFinancialPolicy";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuidOrNull(value) {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function requestedEntityId(body = {}, request = null) {
  let queryEntityId = null;
  try {
    const searchParams = new URL(request?.url || "http://localhost").searchParams;
    queryEntityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id") ||
      searchParams.get("legalEntityId") ||
      searchParams.get("legal_entity_id");
  } catch {}

  return (
    body.entityId ||
    body.entity_id ||
    body.legalEntityId ||
    body.legal_entity_id ||
    queryEntityId ||
    null
  );
}

async function resolveCurrencyCode({ organizationId, entity }) {
  const organizationResult = await supabaseAdmin
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .maybeSingle();

  if (organizationResult.error) throw organizationResult.error;
  const organization = organizationResult.data || {};
  const currencyCode = text(
    entity?.currency ||
      entity?.currency_code ||
      organization.currency_code ||
      organization.base_currency_code ||
      organization.reporting_currency_code ||
      organization.default_currency
  );

  if (!currencyCode) {
    const error = new Error(
      "Configure a currency for the selected legal entity or organization before creating a sales order"
    );
    error.status = 409;
    throw error;
  }

  return currencyCode.toUpperCase();
}

async function loadCanonicalItems({ organizationId, itemIds }) {
  const result = await supabaseAdmin
    .from("inventory_items")
    .select("*")
    .eq("organization_id", organizationId)
    .in("id", itemIds);

  if (result.error) throw result.error;
  return new Map((result.data || []).map((item) => [item.id, item]));
}

function normalizeLines(sourceItems, canonicalItems, financialPolicy) {
  if (!Array.isArray(sourceItems) || !sourceItems.length) {
    const error = new Error("Sales order lines required");
    error.status = 400;
    throw error;
  }

  return sourceItems.map((line, index) => {
    const itemId = uuidOrNull(line.item_id || line.itemId || line.id);
    const item = itemId ? canonicalItems.get(itemId) : null;
    if (!itemId || !item) {
      const error = new Error(`Line ${index + 1} references an unavailable catalog item`);
      error.status = 409;
      throw error;
    }

    const status = String(item.status || "active").trim().toLowerCase();
    if (["inactive", "archived", "deleted", "blocked"].includes(status)) {
      const error = new Error(`Line ${index + 1} catalog item is inactive`);
      error.status = 409;
      throw error;
    }

    const quantity = numeric(line.quantity, 0);
    if (quantity <= 0) {
      const error = new Error(`Line ${index + 1} quantity must be positive`);
      error.status = 400;
      throw error;
    }

    const unitPrice = numeric(
      item.price ?? item.selling_price ?? item.retail_price ?? item.unit_price,
      -1
    );
    if (unitPrice < 0) {
      const error = new Error(`Line ${index + 1} has no valid configured selling price`);
      error.status = 409;
      throw error;
    }

    return {
      item_id: item.id,
      item_type: "inventory_item",
      sku: item.sku || item.item_code || null,
      barcode: item.barcode || item.ean || item.upc || null,
      item_name: item.name || item.item_name || `Item ${index + 1}`,
      description: item.description || null,
      unit: item.unit || item.unit_of_measure || null,
      quantity,
      unit_price: unitPrice,
      discount_amount: 0,
      tax_code_id: uuidOrNull(item.tax_category_id) || financialPolicy.taxCodeId || null,
      tax_code: item.tax_code || financialPolicy.taxCode || null,
      tax_rate: numeric(financialPolicy.taxRate, 0),
      source_payload: {
        source: "inventory_items",
        requested_quantity: quantity,
      },
    };
  });
}

function actorFrom(access = {}) {
  return {
    staffId: uuidOrNull(
      access.access?.staffAccountId || access.staff?.id || access.user?.id || null
    ),
    name:
      access.staff?.display_name ||
      access.staff?.name ||
      access.user?.email ||
      access.userEmail ||
      null,
  };
}

export async function createSalesOrderDraft({
  access,
  body = {},
  organizationId,
  request,
}) {
  const entityId = requestedEntityId(body, request);
  if (!entityId) {
    const error = new Error("Select an active legal entity before creating a sales order");
    error.status = 400;
    throw error;
  }

  const entity = await resolveEntity({ organizationId, entityId });
  if (!entity) {
    const error = new Error("Selected legal entity is outside the organization or inactive");
    error.status = 403;
    throw error;
  }

  const sourceItems = Array.isArray(body.items) ? body.items : [];
  const itemIds = [
    ...new Set(
      sourceItems
        .map((line) => uuidOrNull(line.item_id || line.itemId || line.id))
        .filter(Boolean)
    ),
  ];
  if (!itemIds.length || itemIds.length !== sourceItems.length) {
    const error = new Error("Every sales order line must reference a canonical catalog item");
    error.status = 400;
    throw error;
  }

  const transactionDate = new Date().toISOString();
  const [canonicalItems, financialPolicy, currencyCode] = await Promise.all([
    loadCanonicalItems({ organizationId, itemIds }),
    resolvePOSFinancialPolicy({ organizationId, transactionDate }),
    resolveCurrencyCode({ organizationId, entity }),
  ]);
  const lines = normalizeLines(sourceItems, canonicalItems, financialPolicy);
  const actor = actorFrom(access);
  const idempotencyKey =
    text(body.idempotencyKey || body.idempotency_key) ||
    request?.headers?.get?.("idempotency-key") ||
    `sales-order-draft:${organizationId}:${entityId}:${crypto.randomUUID()}`;

  const rpcResult = await supabaseAdmin.rpc(
    "commercial_create_sales_order_draft_atomic",
    {
      p_organization_id: organizationId,
      p_entity_id: entityId,
      p_channel: text(body.channel) || "POS",
      p_application_id: text(body.applicationId || body.application_id) || "retail",
      p_source_type: text(body.sourceType || body.source_type) || "point_of_sale",
      p_source_reference: text(body.sourceReference || body.source_reference),
      p_customer_id: uuidOrNull(body.customerId || body.customer_id),
      p_customer_name: text(body.customerName || body.customer_name),
      p_customer_email: text(body.customerEmail || body.customer_email),
      p_customer_phone: text(body.customerPhone || body.customer_phone),
      p_currency_code: currencyCode,
      p_prices_include_tax: Boolean(financialPolicy.pricesIncludeTax),
      p_tax_code_id: uuidOrNull(financialPolicy.taxCodeId),
      p_tax_code: financialPolicy.taxCode || null,
      p_tax_rate: numeric(financialPolicy.taxRate, 0),
      p_items: lines,
      p_actor_staff_id: actor.staffId,
      p_actor_name: actor.name,
      p_notes: text(body.notes),
      p_idempotency_key: idempotencyKey,
    }
  );

  if (rpcResult.error) {
    const unavailable =
      rpcResult.error.code === "PGRST202" ||
      /commercial_create_sales_order_draft_atomic/i.test(
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
    application_id: "retail",
    entity_id: entityId,
    idempotency_key: idempotencyKey,
  };
}

export async function listSalesOrders({
  organizationId,
  entityId,
  limit = 200,
}) {
  if (!entityId) {
    const error = new Error("Select an active legal entity before loading sales orders");
    error.status = 400;
    throw error;
  }

  const entity = await resolveEntity({ organizationId, entityId });
  if (!entity) {
    const error = new Error("Selected legal entity is outside the organization or inactive");
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
      status: "DRAFT",
    });
    linesByOrder.set(line.sales_order_id, current);
  }

  return orders.map((order) => ({
    ...order,
    active: !["CANCELLED", "CLOSED", "FULFILLED"].includes(
      String(order.status || "").toUpperCase()
    ),
    order_items: linesByOrder.get(order.id) || [],
    items: linesByOrder.get(order.id) || [],
    total: Number(order.total_amount || 0),
    paid_amount: Number(order.paid_amount || 0),
    remaining_balance: Number(order.remaining_balance || 0),
    context: {
      type: "sale",
      id: order.id,
      reference: order.order_number || order.id,
      label: order.order_number || `Draft sale ${String(order.id).slice(0, 8)}`,
    },
  }));
}

export default {
  createSalesOrderDraft,
  listSalesOrders,
};
