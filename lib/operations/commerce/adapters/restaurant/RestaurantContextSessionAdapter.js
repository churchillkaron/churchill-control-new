import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ACTIVE_ORDER_STATUSES = ["OPEN", "PENDING", "PREPARING"];

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeContext(body = {}) {
  const context = body.context && typeof body.context === "object"
    ? body.context
    : {};
  const id =
    context.id ||
    body.contextId ||
    body.context_id ||
    body.tableId ||
    body.table_id ||
    null;
  const reference =
    context.reference ||
    body.contextReference ||
    body.context_reference ||
    body.tableNumber ||
    body.table_number ||
    null;
  const type = String(
    context.type || body.contextType || body.context_type || "service_location"
  )
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");

  if (type !== "service_location") {
    const error = new Error("Restaurant POS requires a service-location context");
    error.status = 400;
    throw error;
  }

  if (!id && !reference) {
    const error = new Error("Missing POS context");
    error.status = 400;
    throw error;
  }

  return {
    type: "service_location",
    id,
    reference: reference == null ? null : String(reference),
  };
}

async function loadTable({ context, organizationId }) {
  let query = supabaseAdmin
    .from("restaurant_tables")
    .select("*")
    .eq("organization_id", organizationId);

  if (context.id) {
    query = query.eq("id", context.id);
  } else {
    query = query.or(
      `table_number.eq.${context.reference},table_name.eq.${context.reference}`
    );
  }

  const result = await query.maybeSingle();
  if (result.error) throw result.error;

  if (!result.data) {
    const error = new Error("Restaurant service location not found");
    error.status = 404;
    throw error;
  }

  return result.data;
}

function contextFromTable(table) {
  const reference = String(
    table.table_number || table.table_name || table.id
  );

  return {
    type: "service_location",
    id: table.id,
    reference,
    label: table.table_name || `Table ${reference}`,
    group_id: table.zone_id || null,
    status: table.status || null,
  };
}

export async function openRestaurantContext({ body, organizationId }) {
  const requestedContext = normalizeContext(body);
  const selectedTable = await loadTable({
    context: requestedContext,
    organizationId,
  });

  const { data: merges, error: mergeError } = await supabaseAdmin
    .from("restaurant_table_merges")
    .select("master_table_id, merged_table_id")
    .eq("organization_id", organizationId)
    .or(
      `master_table_id.eq.${selectedTable.id},merged_table_id.eq.${selectedTable.id}`
    );

  if (mergeError) throw mergeError;

  const mergedRow = (merges || []).find(
    (row) => row.merged_table_id === selectedTable.id
  );
  const effectiveTableId = mergedRow?.master_table_id || selectedTable.id;
  const contextIds = new Set([effectiveTableId]);

  for (const row of merges || []) {
    if (row.master_table_id === effectiveTableId) {
      contextIds.add(row.merged_table_id);
    }
  }

  const { data: relatedMerges, error: relatedMergeError } = await supabaseAdmin
    .from("restaurant_table_merges")
    .select("master_table_id, merged_table_id")
    .eq("organization_id", organizationId)
    .eq("master_table_id", effectiveTableId);

  if (relatedMergeError) throw relatedMergeError;

  for (const row of relatedMerges || []) {
    contextIds.add(row.merged_table_id);
  }

  const { data: orders, error: orderError } = await supabaseAdmin
    .from("orders")
    .select("*, order_items(*)")
    .eq("organization_id", organizationId)
    .in("table_id", [...contextIds])
    .in("status", ACTIVE_ORDER_STATUSES)
    .order("created_at", { ascending: true });

  if (orderError) throw orderError;

  const persistedOrders = orders || [];
  const items = persistedOrders.flatMap(
    (order) => order.order_items || []
  );
  const subtotal = persistedOrders.reduce(
    (sum, order) => sum + numeric(order.subtotal),
    0
  );
  const serviceCharge = persistedOrders.reduce(
    (sum, order) =>
      sum + numeric(order.service_charge_amount || order.service_charge),
    0
  );
  const tax = persistedOrders.reduce(
    (sum, order) => sum + numeric(order.vat_amount || order.tax_amount),
    0
  );
  const discount = persistedOrders.reduce(
    (sum, order) => sum + numeric(order.discount_amount),
    0
  );
  const total = persistedOrders.reduce(
    (sum, order) => sum + numeric(order.total_amount || order.total),
    0
  );
  const context = contextFromTable(selectedTable);

  return {
    application_id: "restaurant",
    context,
    effective_context_id: effectiveTableId,
    related_context_ids: [...contextIds],
    orders: persistedOrders,
    items,
    summary: {
      subtotal: Number(subtotal.toFixed(2)),
      service_charge: Number(serviceCharge.toFixed(2)),
      tax: Number(tax.toFixed(2)),
      discount: Number(discount.toFixed(2)),
      total: Number(total.toFixed(2)),
      item_count: items.length,
    },

    // Compatibility for existing restaurant clients.
    effective_table_id: effectiveTableId,
    merged_table_ids: [...contextIds],
  };
}

const RestaurantContextSessionAdapter = Object.freeze({
  openContext: openRestaurantContext,
});

export default RestaurantContextSessionAdapter;
