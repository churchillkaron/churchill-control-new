import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const REQUIRED_BINDINGS = Object.freeze([
  Object.freeze({
    id: "catalog",
    owner: "supply-chain",
    contract: "supply-chain.inventory-items",
    description: "Sellable items, SKUs, prices and product metadata.",
  }),
  Object.freeze({
    id: "availability",
    owner: "supply-chain",
    contract: "supply-chain.inventory-availability",
    description: "Location-aware stock availability and reservation behavior.",
  }),
  Object.freeze({
    id: "orders",
    owner: "commercial",
    contract: "commercial.sales-orders",
    description: "Canonical sales-order and line persistence.",
  }),
  Object.freeze({
    id: "settlement",
    owner: "finance",
    contract: "finance.payment-settlement",
    description: "Tender authorization, capture, refund and accounting handoff.",
  }),
]);

function text(value) {
  return String(value ?? "").trim();
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function activeItem(item = {}) {
  const status = text(item.status || "active").toLowerCase();
  return !["inactive", "archived", "deleted", "blocked"].includes(status);
}

function entityIdFrom({ access, entityId, organization } = {}) {
  return (
    entityId ||
    access?.entityId ||
    access?.entity_id ||
    access?.access?.entityId ||
    access?.access?.entity_id ||
    organization?.default_entity_id ||
    organization?.legal_entity_id ||
    null
  );
}

async function loadItems(organizationId) {
  const result = await supabaseAdmin
    .from("inventory_items")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (result.error) throw result.error;
  return (result.data || []).filter(activeItem);
}

async function loadLedger({ organizationId, entityId }) {
  if (!entityId) {
    throw new Error("Select an active legal entity before loading retail stock");
  }

  const result = await supabaseAdmin
    .from("inventory_ledger")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: true });

  if (result.error) throw result.error;
  return result.data || [];
}

function availabilityByItem(ledger = []) {
  const positions = new Map();

  for (const row of ledger) {
    if (!row.item_id) continue;

    const key = [
      row.item_id,
      row.warehouse_id || "",
      row.location_id || "",
    ].join(":");
    const current = positions.get(key) || {
      item_id: row.item_id,
      warehouse_id: row.warehouse_id || null,
      location_id: row.location_id || null,
      quantity: 0,
      updated_at: null,
    };

    const persistedBalance = Number(row.new_quantity);
    current.quantity = Number.isFinite(persistedBalance)
      ? persistedBalance
      : current.quantity + numeric(row.quantity);
    current.updated_at = row.created_at || current.updated_at;
    positions.set(key, current);
  }

  const byItem = new Map();
  for (const position of positions.values()) {
    const current = byItem.get(position.item_id) || {
      on_hand: 0,
      positions: [],
      last_updated_at: null,
    };
    current.on_hand += numeric(position.quantity);
    current.positions.push(position);
    if (
      position.updated_at &&
      (!current.last_updated_at ||
        new Date(position.updated_at) > new Date(current.last_updated_at))
    ) {
      current.last_updated_at = position.updated_at;
    }
    byItem.set(position.item_id, current);
  }

  return byItem;
}

function catalogItem(item, availability, availabilityReady) {
  const onHand = availabilityReady && availability
    ? numeric(availability.on_hand)
    : null;
  const price = numeric(
    item.price ?? item.selling_price ?? item.retail_price ?? item.unit_price,
    0
  );

  return {
    id: item.id,
    type: "catalog_item",
    name: item.name || item.item_name || "Item",
    description: item.description || null,
    sku: item.sku || item.item_code || null,
    barcode: item.barcode || item.ean || item.upc || null,
    category_id: item.category_id || null,
    category: item.category || item.category_name || null,
    unit: item.unit || item.unit_of_measure || null,
    price,
    tax_category_id: item.tax_category_id || null,
    tax_code: item.tax_code || null,
    image_url: item.image_url || item.photo_url || null,
    available: availabilityReady && onHand > 0,
    availability: {
      status:
        onHand === null ? "unknown" : onHand > 0 ? "in_stock" : "out_of_stock",
      on_hand: onHand,
      positions: availability?.positions || [],
      last_updated_at: availability?.last_updated_at || null,
    },
    source: {
      type: "inventory_item",
      id: item.id,
    },
  };
}

function bindingState(id, state, message) {
  const definition = REQUIRED_BINDINGS.find((item) => item.id === id);
  return {
    ...definition,
    state,
    message,
  };
}

export async function loadRetailPOSReadiness({
  access,
  entityId: requestedEntityId,
  organization,
  organizationId,
}) {
  const entityId = entityIdFrom({
    access,
    entityId: requestedEntityId,
    organization,
  });
  let items = [];
  let ledger = [];
  let catalogError = null;
  let availabilityError = null;

  try {
    items = await loadItems(organizationId);
  } catch (error) {
    catalogError = error?.message || "Unable to load inventory items";
  }

  try {
    ledger = await loadLedger({ organizationId, entityId });
  } catch (error) {
    availabilityError = error?.message || "Unable to load inventory availability";
  }

  const availabilityReady = Boolean(entityId) && !availabilityError;
  const availability = availabilityByItem(ledger);
  const catalogItems = items.map((item) =>
    catalogItem(
      item,
      availability.get(item.id) || null,
      availabilityReady
    )
  );
  const bindings = [
    bindingState(
      "catalog",
      catalogError ? "error" : "active",
      catalogError || `${catalogItems.length} canonical inventory items available`
    ),
    bindingState(
      "availability",
      availabilityError ? "blocked" : "active",
      availabilityError ||
        `${ledger.length} inventory ledger entries evaluated for the selected entity`
    ),
    bindingState(
      "orders",
      "blocked",
      "Commercial CREATE_SALES_ORDER is not implemented"
    ),
    bindingState(
      "settlement",
      "blocked",
      "Finance retail tender settlement is not implemented"
    ),
  ];
  const readReady = !catalogError && availabilityReady;

  return {
    application_id: "retail",
    status: readReady ? "partially_ready" : "configuration_required",
    transaction_ready: false,
    catalog_ready: !catalogError,
    availability_ready: availabilityReady,
    organization_id: organizationId,
    entity_id: entityId,
    context_schema: {
      type: "sale",
      requires_context: false,
      requires_item_assignment: false,
    },
    context_groups: [],
    contexts: [],
    catalog: {
      items: catalogItems,
      item_count: catalogItems.length,
      available_item_count: catalogItems.filter((item) => item.available).length,
    },
    fulfillment: {
      mode: "inventory_handoff",
      route: null,
    },
    readiness: {
      state: readReady ? "partial" : "blocked",
      reason: readReady
        ? "Retail catalog and entity-scoped availability are connected. Order creation and settlement remain blocked until their canonical domain contracts are implemented."
        : availabilityError || "Retail catalog or inventory availability could not be loaded.",
      bindings,
      required_bindings: bindings,
    },
  };
}

const RetailPOSReadinessAdapter = Object.freeze({
  id: "retail",
  loadRuntime: loadRetailPOSReadiness,
});

export default RetailPOSReadinessAdapter;
