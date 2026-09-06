import { supabaseAdmin } from "@/lib/shared/supabase/admin";

async function queryRows(query) {
  const result = await query;
  if (result.error) throw result.error;
  return result.data || [];
}

function unavailableRpc(error, functionName) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST202" ||
    error?.code === "42501" ||
    error?.code === "42883" ||
    message.includes(`could not find the function public.${String(functionName || "").toLowerCase()}`) ||
    message.includes("permission denied for function")
  );
}

async function correctionRpcReady(functionName) {
  const result = await supabaseAdmin.rpc(functionName, {
    p_organization_id: null,
    p_entity_id: null,
    p_application_id: "restaurant",
    p_order_id: null,
    p_order_item_id: null,
    p_actor_id: null,
    p_actor_role: null,
    p_reason: null,
    p_service_charge_rate: 0,
    p_tax_rate: 0,
    p_prices_include_tax: false,
    p_idempotency_key: null,
  });

  if (!result.error) return true;
  return !unavailableRpc(result.error, functionName);
}

async function restaurantCorrectionCapabilities() {
  const tableResult = await supabaseAdmin
    .from("restaurant_order_item_corrections")
    .select("id")
    .limit(1);

  if (tableResult.error) {
    return {
      itemCorrectionsReady: false,
      compReady: false,
    };
  }

  const [voidReady, compReady] = await Promise.all([
    correctionRpcReady("restaurant_void_order_item_atomic"),
    correctionRpcReady("restaurant_comp_order_item_atomic"),
  ]);

  return {
    itemCorrectionsReady: voidReady,
    compReady,
  };
}

function contextFromTable(table) {
  const reference = String(
    table.table_number || table.table_name || table.name || table.id || ""
  );

  return {
    id: table.id,
    type: "service_location",
    reference,
    label: table.table_name || `Table ${reference}`,
    group_id: table.zone_id || null,
    status: table.status || null,
    capacity: table.capacity ?? table.seats ?? null,
    source: {
      type: "restaurant_table",
      id: table.id,
    },
  };
}

function groupFromZone(zone) {
  return {
    id: zone.id,
    type: "service_area",
    code: zone.code || null,
    name: zone.name || zone.zone_name || "Service Area",
    order: Number(zone.sort_order || 0),
    status: zone.status || null,
    source: {
      type: "restaurant_zone",
      id: zone.id,
    },
  };
}

function catalogItemFromDish(dish) {
  return {
    id: dish.id,
    type: "catalog_item",
    name: dish.name || dish.item_name || "Item",
    description: dish.description || null,
    category_id: dish.category_id || null,
    category: dish.category || dish.category_name || null,
    price: Number(dish.price ?? dish.selling_price ?? 0),
    tax_category_id: dish.tax_category_id || null,
    available: dish.available !== false && dish.is_available !== false,
    work_center_id: dish.work_center_id || null,
    fulfillment_route: dish.station || dish.preparation_station || null,
    image_url: dish.image_url || dish.photo_url || null,
    source: {
      type: "dish",
      id: dish.id,
    },
    legacy: dish,
  };
}

export async function loadRestaurantPOSRuntime({ organizationId }) {
  const [zones, tables, dishes, correctionCapabilities] = await Promise.all([
    queryRows(
      supabaseAdmin
        .from("restaurant_zones")
        .select("*")
        .eq("organization_id", organizationId)
        .order("sort_order")
    ),
    queryRows(
      supabaseAdmin
        .from("restaurant_tables")
        .select("*")
        .eq("organization_id", organizationId)
        .order("table_number")
    ),
    queryRows(
      supabaseAdmin
        .from("dishes")
        .select("*")
        .eq("organization_id", organizationId)
        .order("name")
    ),
    restaurantCorrectionCapabilities(),
  ]);

  const contextGroups = zones.map(groupFromZone);
  const contexts = tables.map(contextFromTable);
  const catalogItems = dishes.map(catalogItemFromDish);

  return {
    application_id: "restaurant",
    context_schema: {
      type: "service_location",
      group_type: "service_area",
      requires_context: true,
      requires_item_assignment: true,
      assignment_label: "Seat",
    },
    context_groups: contextGroups,
    contexts,
    catalog: {
      items: catalogItems,
      item_count: catalogItems.length,
    },
    fulfillment: {
      mode: "work_center_dispatch",
      route: "/api/operations/fulfillment",
    },
    capabilities: {
      item_corrections_ready: correctionCapabilities.itemCorrectionsReady,
      comp_ready: correctionCapabilities.compReady,
      discounts_ready: false,
      non_cash_refunds_ready: false,
    },

    // Compatibility fields for the existing restaurant POS components.
    zones,
    tables,
    dishes,
  };
}

const RestaurantPOSRuntimeAdapter = Object.freeze({
  id: "restaurant",
  loadRuntime: loadRestaurantPOSRuntime,
});

export default RestaurantPOSRuntimeAdapter;
