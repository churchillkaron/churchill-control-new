import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { ChannelAssetRuntime } from "@/lib/platform/channels/runtime/ChannelAssetRuntime";
import { CustomerIdentityRuntime } from "@/lib/platform/service-runtime/identity/runtime/CustomerIdentityRuntime";
import { AttributionRuntime } from "@/lib/platform/service-runtime/attribution/runtime/AttributionRuntime";

const MAX_ATTEMPTS = 5;
const SHOPIFY_EVENT_PREFIX = "shopify.";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nonnegative(value) {
  return Math.max(0, number(value, 0));
}

function eventEnvelope(event) {
  return object(event?.payload);
}

function providerPayload(event) {
  return object(eventEnvelope(event).provider_payload);
}

function webhookData(event) {
  return object(providerPayload(event).data);
}

function webhookTopic(event) {
  return text(providerPayload(event).topic).toLowerCase();
}

function projectionState(event) {
  return object(eventEnvelope(event).projection);
}

async function updateEvent(event, status, patch = {}) {
  const payload = eventEnvelope(event);
  const projection = projectionState(event);
  const attempts = Math.max(number(projection.attempts, 0), 0);
  const now = new Date().toISOString();
  const nextPayload = {
    ...payload,
    projection: {
      ...projection,
      ...patch,
      attempts: patch.attempts ?? attempts,
      updated_at: now,
    },
  };

  const result = await supabaseAdmin
    .from("event_bus")
    .update({
      status,
      processed_at: status === "PROCESSED" ? now : null,
      payload: nextPayload,
    })
    .eq("id", event.id)
    .eq("organization_id", event.organization_id)
    .select("*")
    .single();

  if (result.error) throw result.error;
  return result.data;
}

async function loadStoreAsset(event) {
  const connectionId = text(eventEnvelope(event).connection_id);
  if (!connectionId) return null;

  const result = await supabaseAdmin
    .from("organization_channel_assets")
    .select("*")
    .eq("organization_id", event.organization_id)
    .eq("connection_id", connectionId)
    .eq("channel_provider", "shopify")
    .eq("asset_type", "shopify_store")
    .maybeSingle();

  if (result.error) throw result.error;
  return result.data || null;
}

async function existingAsset({ organizationId, assetType, externalId }) {
  if (!externalId) return null;
  return ChannelAssetRuntime.find({
    organization_id: organizationId,
    provider: "shopify",
    asset_type: assetType,
    external_id: String(externalId),
  });
}

async function saveAsset({
  event,
  storeAsset,
  assetType,
  externalId,
  name,
  entityId = undefined,
  metadata = {},
}) {
  if (!text(externalId)) return null;
  const existing = await existingAsset({
    organizationId: event.organization_id,
    assetType,
    externalId: String(externalId),
  });

  return ChannelAssetRuntime.register({
    organization_id: event.organization_id,
    connection_id: text(eventEnvelope(event).connection_id) || storeAsset?.connection_id || null,
    provider: "shopify",
    asset_type: assetType,
    external_id: String(externalId),
    name: text(name) || existing?.name || String(externalId),
    entity_id:
      entityId === undefined
        ? existing?.entity_id || null
        : entityId,
    selected_by_party_id: existing?.selected_by_party_id || null,
    selected_at: existing?.selected_at || null,
    metadata: {
      ...object(existing?.metadata),
      ...metadata,
      source: "SHOPIFY",
      last_projected_event_id: event.id,
      last_projected_at: new Date().toISOString(),
    },
  });
}

function financialStatus(data) {
  const status = text(data.financial_status).toLowerCase();
  if (status === "paid") return "PAID";
  if (status === "partially_paid") return "PARTIALLY_PAID";
  if (status === "refunded") return "REFUNDED";
  if (status === "voided") return "VOID";
  if (status === "partially_refunded") {
    return nonnegative(data.total_outstanding) > 0 ? "PARTIALLY_PAID" : "PAID";
  }
  return "UNPAID";
}

function fulfillmentStatus(data, topic) {
  if (topic === "orders/cancelled" || data.cancelled_at) return "CANCELLED";
  const status = text(data.fulfillment_status).toLowerCase();
  if (status === "fulfilled") return "FULFILLED";
  if (["partial", "partially_fulfilled"].includes(status)) return "PARTIALLY_FULFILLED";
  return "NOT_STARTED";
}

function orderStatus(data, topic) {
  const fulfillment = fulfillmentStatus(data, topic);
  if (fulfillment === "CANCELLED") return "CANCELLED";
  if (fulfillment === "FULFILLED") return "FULFILLED";
  if (fulfillment === "PARTIALLY_FULFILLED") return "PARTIALLY_FULFILLED";
  if (data.closed_at) return "CLOSED";
  return "CONFIRMED";
}

function lineTax(line) {
  return array(line?.tax_lines).reduce(
    (sum, row) => sum + nonnegative(row?.price ?? row?.price_set?.shop_money?.amount),
    0,
  );
}

async function mappedVariantItems(event, data) {
  const variantIds = array(data.line_items)
    .map((line) => text(line?.variant_id))
    .filter(Boolean);
  if (!variantIds.length) return new Map();

  const result = await supabaseAdmin
    .from("organization_channel_assets")
    .select("external_id,metadata")
    .eq("organization_id", event.organization_id)
    .eq("channel_provider", "shopify")
    .eq("asset_type", "shopify_variant")
    .in("external_id", [...new Set(variantIds)]);
  if (result.error) throw result.error;

  const mapping = new Map();
  for (const row of result.data || []) {
    const inventoryItemId = text(row?.metadata?.inventory_item_id);
    if (inventoryItemId) mapping.set(String(row.external_id), inventoryItemId);
  }
  return mapping;
}

function normalizeOrderLines(data, variantMapping) {
  return array(data.line_items)
    .filter((line) => number(line?.quantity, 0) > 0)
    .map((line) => {
      const quantity = number(line.quantity, 0);
      const unitPrice = nonnegative(line.price ?? line.price_set?.shop_money?.amount);
      const discount = nonnegative(line.total_discount);
      const subtotal = Math.max(0, quantity * unitPrice - discount);
      const tax = lineTax(line);
      const variantId = text(line.variant_id);
      return {
        item_id: variantId ? variantMapping.get(variantId) || null : null,
        item_name: text(line.name || line.title) || `Shopify item ${text(line.id)}`,
        sku: text(line.sku) || null,
        barcode: text(line.barcode) || null,
        quantity,
        unit_price: unitPrice,
        discount_amount: discount,
        line_subtotal: subtotal,
        tax_amount: tax,
        line_total: subtotal + tax,
        source_payload: {
          provider: "shopify",
          line_item_id: text(line.id) || null,
          product_id: text(line.product_id) || null,
          variant_id: variantId || null,
          vendor: text(line.vendor) || null,
          fulfillment_status: text(line.fulfillment_status) || null,
        },
      };
    });
}

async function resolveCustomerParty(event, data) {
  const customerId = text(data?.customer?.id || data?.customer_id);
  if (!customerId) return null;
  const identity = await CustomerIdentityRuntime.resolve({
    organization_id: event.organization_id,
    provider_id: "shopify",
    external_id: customerId,
  }).catch(() => null);
  return identity?.party_id || null;
}

async function attributionExists(eventId) {
  const result = await supabaseAdmin
    .from("attribution_events")
    .select("id")
    .eq("provider_event_id", eventId)
    .limit(1);
  if (result.error) throw result.error;
  return Boolean(result.data?.length);
}

async function projectOrder(event, storeAsset, data, topic) {
  if (!storeAsset?.entity_id) {
    const error = new Error("SHOPIFY_STORE_ENTITY_MAPPING_REQUIRED");
    error.code = "BLOCKED_CONFIGURATION";
    throw error;
  }

  const orderId = text(data.id);
  if (!orderId) throw new Error("SHOPIFY_ORDER_ID_REQUIRED");
  const connectionId = text(eventEnvelope(event).connection_id);
  const currency = text(data.currency || data.presentment_currency).toUpperCase();
  if (!currency) throw new Error("SHOPIFY_ORDER_CURRENCY_REQUIRED");

  const total = nonnegative(data.current_total_price ?? data.total_price);
  const outstanding = nonnegative(data.total_outstanding);
  const payment = financialStatus(data);
  const paid = payment === "REFUNDED"
    ? total
    : payment === "PAID"
      ? total
      : Math.max(0, total - outstanding);
  const remaining = payment === "REFUNDED" || payment === "VOID"
    ? 0
    : Math.min(total, outstanding);
  const variantMapping = await mappedVariantItems(event, data);
  const items = normalizeOrderLines(data, variantMapping);
  const partyId = await resolveCustomerParty(event, data);
  const customer = object(data.customer);
  const sourceReference = `shopify:order:${orderId}`;
  const idempotencyKey = `shopify-order:${connectionId}:${orderId}`;
  const orderNumber = `SHP-${connectionId.slice(0, 8)}-${text(data.order_number || data.name || orderId).replace(/^#/, "")}`;

  const result = await supabaseAdmin.rpc(
    "commercial_upsert_external_sales_order_atomic",
    {
      p_organization_id: event.organization_id,
      p_entity_id: storeAsset.entity_id,
      p_channel: "SHOPIFY",
      p_application_id: "commercial",
      p_source_type: "shopify_order",
      p_source_reference: sourceReference,
      p_order_number: orderNumber,
      p_party_id: partyId,
      p_customer_name: text(`${customer.first_name || ""} ${customer.last_name || ""}`) || text(customer.name) || null,
      p_customer_email: text(data.email || customer.email) || null,
      p_customer_phone: text(data.phone || customer.phone) || null,
      p_status: orderStatus(data, topic),
      p_payment_status: payment,
      p_fulfillment_status: fulfillmentStatus(data, topic),
      p_currency_code: currency,
      p_subtotal: nonnegative(data.current_subtotal_price ?? data.subtotal_price),
      p_discount_amount: nonnegative(data.current_total_discounts ?? data.total_discounts),
      p_tax_amount: nonnegative(data.current_total_tax ?? data.total_tax),
      p_total_amount: total,
      p_paid_amount: paid,
      p_remaining_balance: remaining,
      p_confirmed_at: data.created_at || data.processed_at || new Date().toISOString(),
      p_cancelled_at: data.cancelled_at || null,
      p_items: items,
      p_idempotency_key: idempotencyKey,
    },
  );
  if (result.error) throw result.error;

  const salesOrderId = result.data?.sales_order_id || null;
  if (!(await attributionExists(event.id))) {
    await AttributionRuntime.record({
      organization_id: event.organization_id,
      provider_event_id: event.id,
      provider_id: "shopify",
      source_type: "PROVIDER",
      source_id: text(eventEnvelope(event).external_event_id) || sourceReference,
      party_id: partyId,
      order_id: salesOrderId,
      event_type: event.event_type,
      value: total,
      currency,
      metadata: {
        shop: providerPayload(event).shop || null,
        source_reference: sourceReference,
        sales_order_id: salesOrderId,
      },
    });
  }

  return {
    kind: "SALES_ORDER",
    sales_order_id: salesOrderId,
    entity_id: storeAsset.entity_id,
    source_reference: sourceReference,
  };
}

async function projectProduct(event, storeAsset, data, topic) {
  const deleted = topic === "products/delete";
  const productId = text(data.id);
  if (!productId) throw new Error("SHOPIFY_PRODUCT_ID_REQUIRED");

  const product = await saveAsset({
    event,
    storeAsset,
    assetType: "shopify_product",
    externalId: productId,
    name: text(data.title) || `Shopify product ${productId}`,
    entityId: storeAsset?.entity_id || null,
    metadata: {
      deleted,
      handle: text(data.handle) || null,
      status: text(data.status) || null,
      vendor: text(data.vendor) || null,
      product_type: text(data.product_type) || null,
      published_at: data.published_at || null,
      updated_at: data.updated_at || null,
    },
  });

  if (!deleted) {
    for (const variant of array(data.variants)) {
      const variantId = text(variant.id);
      if (!variantId) continue;
      await saveAsset({
        event,
        storeAsset,
        assetType: "shopify_variant",
        externalId: variantId,
        name: text(variant.title) || text(data.title) || `Shopify variant ${variantId}`,
        entityId: storeAsset?.entity_id || null,
        metadata: {
          product_id: productId,
          sku: text(variant.sku) || null,
          barcode: text(variant.barcode) || null,
          price: nonnegative(variant.price),
          shopify_inventory_item_id: text(variant.inventory_item_id) || null,
          deleted: false,
        },
      });
    }
  }

  return { kind: "CHANNEL_ASSET", asset_id: product?.id || null, asset_type: "shopify_product" };
}

async function projectLocation(event, storeAsset, data, topic) {
  const locationId = text(data.id);
  if (!locationId) throw new Error("SHOPIFY_LOCATION_ID_REQUIRED");
  const asset = await saveAsset({
    event,
    storeAsset,
    assetType: "shopify_location",
    externalId: locationId,
    name: text(data.name) || `Shopify location ${locationId}`,
    metadata: {
      deleted: topic === "locations/delete",
      active: data.active ?? data.is_active ?? null,
      address1: text(data.address1) || null,
      address2: text(data.address2) || null,
      city: text(data.city) || null,
      province: text(data.province) || null,
      country: text(data.country) || null,
      country_code: text(data.country_code) || null,
      zip: text(data.zip) || null,
    },
  });
  return { kind: "CHANNEL_ASSET", asset_id: asset?.id || null, asset_type: "shopify_location" };
}

async function projectInventoryItem(event, storeAsset, data) {
  const inventoryItemId = text(data.id);
  if (!inventoryItemId) throw new Error("SHOPIFY_INVENTORY_ITEM_ID_REQUIRED");
  const asset = await saveAsset({
    event,
    storeAsset,
    assetType: "shopify_inventory_item",
    externalId: inventoryItemId,
    name: text(data.sku) || `Shopify inventory item ${inventoryItemId}`,
    entityId: storeAsset?.entity_id || null,
    metadata: {
      sku: text(data.sku) || null,
      tracked: data.tracked ?? null,
      requires_shipping: data.requires_shipping ?? null,
      cost: data.cost == null ? null : nonnegative(data.cost),
    },
  });
  return { kind: "CHANNEL_ASSET", asset_id: asset?.id || null, asset_type: "shopify_inventory_item" };
}

async function projectInventoryLevel(event, storeAsset, data) {
  const inventoryItemId = text(data.inventory_item_id);
  const locationId = text(data.location_id);
  if (!inventoryItemId || !locationId) {
    throw new Error("SHOPIFY_INVENTORY_LEVEL_SCOPE_REQUIRED");
  }
  const externalId = `${inventoryItemId}:${locationId}`;
  const asset = await saveAsset({
    event,
    storeAsset,
    assetType: "shopify_inventory_level",
    externalId,
    name: `Shopify inventory ${inventoryItemId} @ ${locationId}`,
    metadata: {
      inventory_item_id: inventoryItemId,
      location_id: locationId,
      available: data.available == null ? null : number(data.available),
      updated_at: data.updated_at || null,
    },
  });
  return { kind: "CHANNEL_ASSET", asset_id: asset?.id || null, asset_type: "shopify_inventory_level" };
}

async function projectEvent(event) {
  const topic = webhookTopic(event);
  const data = webhookData(event);
  const storeAsset = await loadStoreAsset(event);
  if (!storeAsset) {
    const error = new Error("SHOPIFY_STORE_ASSET_REQUIRED");
    error.code = "BLOCKED_CONFIGURATION";
    throw error;
  }

  if (["orders/create", "orders/updated", "orders/cancelled"].includes(topic)) {
    return projectOrder(event, storeAsset, data, topic);
  }
  if (["products/create", "products/update", "products/delete"].includes(topic)) {
    return projectProduct(event, storeAsset, data, topic);
  }
  if (["locations/create", "locations/update", "locations/delete"].includes(topic)) {
    return projectLocation(event, storeAsset, data, topic);
  }
  if (topic === "inventory_items/update") {
    return projectInventoryItem(event, storeAsset, data);
  }
  if (topic === "inventory_levels/update") {
    return projectInventoryLevel(event, storeAsset, data);
  }

  return { kind: "IGNORED", reason: "UNSUPPORTED_SHOPIFY_TOPIC", topic };
}

async function loadPendingEvents(limit) {
  const result = await supabaseAdmin
    .from("event_bus")
    .select("*")
    .in("status", ["PENDING", "ERROR"])
    .like("event_type", `${SHOPIFY_EVENT_PREFIX}%`)
    .order("created_at", { ascending: true })
    .limit(Math.max(Number(limit) * 3, 30));
  if (result.error) throw result.error;

  return (result.data || [])
    .filter((event) => {
      const envelope = eventEnvelope(event);
      const projection = projectionState(event);
      return envelope.provider_event === true &&
        text(envelope.provider_id) === "shopify" &&
        number(projection.attempts, 0) < MAX_ATTEMPTS;
    })
    .slice(0, Math.max(1, Number(limit) || 10));
}

export async function processShopifyEvents({ limit = 10 } = {}) {
  const events = await loadPendingEvents(limit);
  const results = [];

  for (const event of events) {
    const attempts = number(projectionState(event).attempts, 0) + 1;
    try {
      const projected = await projectEvent(event);
      await updateEvent(event, "PROCESSED", {
        attempts,
        status: "PROCESSED",
        result: projected,
        last_error: null,
        completed_at: new Date().toISOString(),
      });
      results.push({ success: true, event_id: event.id, ...projected });
    } catch (error) {
      const blocked = error?.code === "BLOCKED_CONFIGURATION";
      const status = blocked ? "BLOCKED_CONFIGURATION" : "ERROR";
      await updateEvent(event, status, {
        attempts,
        status,
        last_error: error?.message || "SHOPIFY_EVENT_PROJECTION_FAILED",
      }).catch(() => null);
      results.push({
        success: false,
        blocked,
        event_id: event.id,
        error: error?.message || "SHOPIFY_EVENT_PROJECTION_FAILED",
      });
    }
  }

  return {
    success: results.every((row) => row.success || row.blocked),
    checked: events.length,
    projected: results.filter((row) => row.success).length,
    blocked: results.filter((row) => row.blocked).length,
    failed: results.filter((row) => !row.success && !row.blocked).length,
    results,
  };
}

export async function reactivateBlockedShopifyEvents({ organizationId, connectionId }) {
  const result = await supabaseAdmin
    .from("event_bus")
    .update({ status: "PENDING", processed_at: null })
    .eq("organization_id", organizationId)
    .eq("status", "BLOCKED_CONFIGURATION")
    .like("event_type", `${SHOPIFY_EVENT_PREFIX}%`)
    .contains("payload", {
      provider_event: true,
      provider_id: "shopify",
      connection_id: connectionId,
    })
    .select("id");
  if (result.error) throw result.error;
  return { reactivated: result.data?.length || 0 };
}

export async function reactivateShopifyOrderEvents({
  organizationId,
  connectionId,
  limit = 250,
}) {
  const result = await supabaseAdmin
    .from("event_bus")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "PROCESSED")
    .like("event_type", "shopify.orders.%")
    .contains("payload", {
      provider_event: true,
      provider_id: "shopify",
      connection_id: connectionId,
    })
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(Number(limit) || 250, 500)));
  if (result.error) throw result.error;

  let reactivated = 0;
  for (const event of result.data || []) {
    await updateEvent(event, "PENDING", {
      attempts: 0,
      status: "PENDING",
      result: null,
      last_error: null,
      completed_at: null,
      requeued_reason: "SHOPIFY_VARIANT_MAPPING_CHANGED",
      requeued_at: new Date().toISOString(),
    });
    reactivated += 1;
  }

  return { reactivated };
}
