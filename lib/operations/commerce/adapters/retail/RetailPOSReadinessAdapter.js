import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  signedInventoryQuantity,
} from "@/lib/inventory/movements/inventoryMovementSemantics";

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
    description: "Entity-scoped stock movements and active reservation availability.",
  }),
  Object.freeze({
    id: "orders",
    owner: "commercial",
    contract: "commercial.sales-orders",
    description: "Canonical sales-order creation, confirmation and inventory reservation.",
  }),
  Object.freeze({
    id: "settlement",
    owner: "finance",
    contract: "finance.payment-settlement",
    description: "Retail cash settlement, payment persistence and receipt handoff.",
  }),
  Object.freeze({
    id: "fulfillment",
    owner: "supply-chain",
    contract: "supply-chain.sales-order-fulfillment",
    description:
      "Paid reserved sales orders consume reservations, cost layers and physical stock into canonical SALE movements.",
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

async function loadMovements({ organizationId, entityId }) {
  if (!entityId) {
    throw new Error("Select an active legal entity before loading retail stock");
  }

  const result = await supabaseAdmin
    .from("inventory_movements")
    .select(
      "id, organization_id, entity_id, item_id, warehouse_id, location_id, type, quantity, movement_date, created_at"
    )
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .order("movement_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (result.error) throw result.error;
  return result.data || [];
}

async function loadActiveReservations({ organizationId, entityId }) {
  if (!entityId) {
    throw new Error(
      "Select an active legal entity before loading retail reservations"
    );
  }

  const result = await supabaseAdmin
    .from("inventory_reservations")
    .select(
      "id, organization_id, entity_id, item_id, source_document, source_document_id, source_line_id, quantity, status, reserved_at, updated_at"
    )
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("status", "ACTIVE")
    .order("reserved_at", { ascending: true });

  if (result.error) throw result.error;
  return result.data || [];
}

function availabilityByItem({ movements = [], reservations = [] }) {
  const positions = new Map();

  for (const row of movements) {
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
      on_hand: 0,
      last_updated_at: null,
    };

    current.on_hand += signedInventoryQuantity(row.type, row.quantity);
    current.last_updated_at =
      row.movement_date || row.created_at || current.last_updated_at;

    positions.set(key, current);
  }

  const byItem = new Map();

  for (const position of positions.values()) {
    const current = byItem.get(position.item_id) || {
      on_hand: 0,
      reserved: 0,
      available: 0,
      positions: [],
      last_updated_at: null,
    };

    current.on_hand += numeric(position.on_hand);
    current.positions.push(position);

    if (
      position.last_updated_at &&
      (!current.last_updated_at ||
        new Date(position.last_updated_at) > new Date(current.last_updated_at))
    ) {
      current.last_updated_at = position.last_updated_at;
    }

    byItem.set(position.item_id, current);
  }

  for (const reservation of reservations) {
    if (!reservation.item_id) continue;

    const current = byItem.get(reservation.item_id) || {
      on_hand: 0,
      reserved: 0,
      available: 0,
      positions: [],
      last_updated_at: null,
    };

    current.reserved += numeric(reservation.quantity);

    const reservationTimestamp =
      reservation.updated_at || reservation.reserved_at || null;

    if (
      reservationTimestamp &&
      (!current.last_updated_at ||
        new Date(reservationTimestamp) > new Date(current.last_updated_at))
    ) {
      current.last_updated_at = reservationTimestamp;
    }

    byItem.set(reservation.item_id, current);
  }

  for (const current of byItem.values()) {
    current.available = current.on_hand - current.reserved;
  }

  return byItem;
}

function catalogItem(item, availability, availabilityReady) {
  const onHand = availabilityReady ? numeric(availability?.on_hand) : null;
  const reserved = availabilityReady ? numeric(availability?.reserved) : null;
  const availableQuantity = availabilityReady
    ? numeric(availability?.available)
    : null;

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
    price: numeric(
      item.price ?? item.selling_price ?? item.retail_price ?? item.unit_price,
      0
    ),
    tax_category_id: item.tax_category_id || null,
    tax_code: item.tax_code || null,
    image_url: item.image_url || item.photo_url || null,
    available: availabilityReady && availableQuantity > 0,
    availability: {
      status:
        availableQuantity === null
          ? "unknown"
          : availableQuantity > 0
            ? "in_stock"
            : "out_of_stock",
      on_hand: onHand,
      reserved,
      available: availableQuantity,
      positions: availability?.positions || [],
      last_updated_at: availability?.last_updated_at || null,
    },
    source: { type: "inventory_item", id: item.id },
  };
}

function bindingState(id, state, message) {
  return {
    ...REQUIRED_BINDINGS.find((item) => item.id === id),
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
  let movements = [];
  let reservations = [];
  let catalogError = null;
  let availabilityError = null;

  try {
    items = await loadItems(organizationId);
  } catch (error) {
    catalogError = error?.message || "Unable to load inventory items";
  }

  try {
    [movements, reservations] = await Promise.all([
      loadMovements({ organizationId, entityId }),
      loadActiveReservations({ organizationId, entityId }),
    ]);
  } catch (error) {
    availabilityError = error?.message || "Unable to load inventory availability";
  }

  const availabilityReady = Boolean(entityId) && !availabilityError;
  const availability = availabilityByItem({ movements, reservations });
  const catalogItems = items.map((item) =>
    catalogItem(item, availability.get(item.id) || null, availabilityReady)
  );
  const orderCaptureReady = !catalogError && availabilityReady;

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
        `${movements.length} inventory movements and ${reservations.length} active reservations evaluated for the selected entity`
    ),
    bindingState(
      "orders",
      orderCaptureReady ? "active" : "blocked",
      orderCaptureReady
        ? "Commercial draft creation and atomic confirmation/reservation are connected"
        : "Catalog and entity-scoped stock availability are required before Retail order confirmation"
    ),
    bindingState(
      "settlement",
      "active",
      "Finance full-cash Retail settlement, payment persistence and receipt handoff are connected; an open Retail cash session is required at payment time"
    ),
    bindingState(
      "fulfillment",
      "active",
      "Inventory fulfillment consumes paid sales-order reservations and cost layers into canonical SALE movements"
    ),
  ];

  return {
    application_id: "retail",
    status: orderCaptureReady ? "partially_ready" : "configuration_required",
    transaction_ready: false,
    order_capture_ready: orderCaptureReady,
    confirmation_ready: orderCaptureReady,
    catalog_ready: !catalogError,
    availability_ready: availabilityReady,
    settlement_ready: true,
    receipts_ready: true,
    fulfillment_ready: true,
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
      route: "/api/inventory/fulfillment/sales-orders",
      ready: true,
      state: "active",
      reason:
        "Paid reserved Retail sales orders can be fulfilled through the Inventory domain into canonical SALE movements.",
    },
    readiness: {
      state: orderCaptureReady ? "partial" : "blocked",
      reason: orderCaptureReady
        ? "Catalog, entity-scoped availability, Commercial confirmation/reservation, Finance cash settlement, receipts and Inventory fulfillment are connected. Retail remains partially ready until a canonically Retail-bound organization completes live end-to-end certification."
        : availabilityError ||
          catalogError ||
          "Retail catalog or availability could not be loaded.",
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
