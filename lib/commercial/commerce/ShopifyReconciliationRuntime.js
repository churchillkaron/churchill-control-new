import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { executeService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { WalletRepository } from "@/lib/platform/service-runtime/wallet/repositories/WalletRepository";
import { ProviderEventRuntime } from "@/lib/platform/service-runtime/events/runtime/ProviderEventRuntime";

const CAPABILITIES = [
  "commerce.shopify.products.read",
  "commerce.shopify.orders.read",
  "commerce.shopify.inventory.read",
  "commerce.shopify.locations.read",
];
const FULL_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function resourceId(value) {
  if (value?.legacyResourceId !== undefined && value?.legacyResourceId !== null) {
    return text(value.legacyResourceId);
  }
  const raw = text(value?.id ?? value);
  if (!raw) return null;
  return raw.includes("/") ? raw.split("/").filter(Boolean).pop() : raw;
}

function money(value) {
  return Number(object(object(value).shopMoney).amount || 0);
}

function stableHash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value || {}))
    .digest("hex")
    .slice(0, 24);
}

function capabilityKey(capability) {
  return capability.replace(/^commerce\.shopify\./, "").replace(/\.read$/, "");
}

function connectionSyncState(connection) {
  return object(object(connection?.metadata).shopify_reconciliation);
}

function capabilityState(connection, capability) {
  return object(connectionSyncState(connection)[capabilityKey(capability)]);
}

function shouldReset(connection) {
  const last = Date.parse(connectionSyncState(connection).last_full_sync_at || "");
  return !Number.isFinite(last) || Date.now() - last >= FULL_SYNC_INTERVAL_MS;
}

async function saveConnectionSync(connection, patch) {
  const metadata = object(connection.metadata);
  const current = connectionSyncState(connection);
  const next = {
    ...current,
    ...patch,
  };

  const result = await supabaseAdmin
    .from("organization_channel_connections")
    .update({
      metadata: {
        ...metadata,
        shopify_reconciliation: next,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id)
    .eq("organization_id", connection.organization_id)
    .select("*")
    .single();
  if (result.error) throw result.error;
  return result.data;
}

function normalizeProduct(node) {
  return {
    id: resourceId(node),
    title: node.title || null,
    handle: node.handle || null,
    status: node.status || null,
    vendor: node.vendor || null,
    product_type: node.productType || null,
    created_at: node.createdAt || null,
    updated_at: node.updatedAt || null,
    total_inventory: node.totalInventory ?? null,
    variants: array(node?.variants?.nodes).map((variant) => ({
      id: resourceId(variant),
      title: variant.title || null,
      sku: variant.sku || null,
      barcode: variant.barcode || null,
      price: variant.price || null,
      inventory_quantity: variant.inventoryQuantity ?? null,
      inventory_item_id: resourceId(variant.inventoryItem),
      tracked: variant?.inventoryItem?.tracked ?? null,
    })),
  };
}

function normalizeOrder(node) {
  const customer = object(node.customer);
  return {
    id: resourceId(node),
    name: node.name || null,
    order_number: resourceId(node),
    created_at: node.createdAt || null,
    updated_at: node.updatedAt || null,
    cancelled_at: node.cancelledAt || null,
    closed_at: node.closedAt || null,
    email: node.email || customer.email || null,
    phone: node.phone || customer.phone || null,
    financial_status: text(node.displayFinancialStatus).toLowerCase(),
    fulfillment_status: text(node.displayFulfillmentStatus).toLowerCase(),
    currency: node.currencyCode || object(object(node.currentTotalPriceSet).shopMoney).currencyCode || null,
    current_subtotal_price: money(node.currentSubtotalPriceSet),
    current_total_discounts: money(node.currentTotalDiscountsSet),
    current_total_tax: money(node.currentTotalTaxSet),
    current_total_price: money(node.currentTotalPriceSet),
    total_outstanding: money(node.totalOutstandingSet),
    customer: {
      id: resourceId(customer),
      first_name: customer.firstName || null,
      last_name: customer.lastName || null,
      name: customer.displayName || null,
      email: customer.email || null,
      phone: customer.phone || null,
    },
    line_items: array(node?.lineItems?.nodes).map((line) => ({
      id: resourceId(line),
      name: line.name || line.title || null,
      title: line.title || line.name || null,
      quantity: line.currentQuantity ?? line.quantity ?? 0,
      sku: line.sku || null,
      barcode: line?.variant?.barcode || null,
      vendor: line.vendor || null,
      price: money(line.originalUnitPriceSet),
      total_discount: money(line.totalDiscountSet),
      product_id: resourceId(line.product),
      variant_id: resourceId(line.variant),
      tax_lines: array(line.taxLines).map((tax) => ({
        price: money(tax.priceSet),
      })),
    })),
  };
}

function normalizeLocation(node) {
  const address = object(node.address);
  return {
    id: resourceId(node),
    name: node.name || null,
    active: node.isActive ?? null,
    fulfills_online_orders: node.fulfillsOnlineOrders ?? null,
    address1: address.address1 || null,
    address2: address.address2 || null,
    city: address.city || null,
    province: address.province || null,
    province_code: address.provinceCode || null,
    country: address.country || null,
    country_code: address.countryCode || null,
    zip: address.zip || null,
    phone: address.phone || null,
  };
}

function normalizeInventoryItem(node) {
  return {
    id: resourceId(node),
    sku: node.sku || null,
    tracked: node.tracked ?? null,
    updated_at: node.updatedAt || null,
    variant_id: resourceId(node.variant),
    variant_title: node?.variant?.title || null,
    barcode: node?.variant?.barcode || null,
    product_id: resourceId(node?.variant?.product),
    product_title: node?.variant?.product?.title || null,
  };
}

function normalizeInventoryLevel(node, inventoryItemId) {
  const quantities = Object.fromEntries(
    array(node.quantities).map((row) => [text(row.name), Number(row.quantity || 0)]),
  );
  return {
    inventory_item_id: inventoryItemId,
    location_id: resourceId(node.location),
    location_name: node?.location?.name || null,
    available: quantities.available ?? null,
    on_hand: quantities.on_hand ?? null,
    committed: quantities.committed ?? null,
  };
}

async function ingestNormalized({ connection, topic, data, identity }) {
  const externalEventId = `reconcile:${topic}:${identity}:${stableHash(data)}`;
  return ProviderEventRuntime.ingest({
    organization_id: connection.organization_id,
    connection_id: connection.id,
    provider_id: "shopify",
    event_type: `shopify.${topic.replace(/\//g, ".")}`,
    external_event_id: externalEventId,
    customer_reference:
      topic.startsWith("orders/") ? text(data?.customer?.id) || null : null,
    value:
      topic.startsWith("orders/") ? Number(data?.current_total_price || 0) : 0,
    currency:
      topic.startsWith("orders/") ? text(data?.currency) || null : null,
    payload: {
      topic,
      shop: text(connection?.metadata?.shop).toLowerCase(),
      source: "SHOPIFY_RECONCILIATION",
      data,
    },
  });
}

async function ingestCapabilityPage({ connection, capability, providerData }) {
  let ingested = 0;
  let duplicates = 0;

  if (capability === "commerce.shopify.products.read") {
    for (const node of array(providerData?.products?.nodes)) {
      const data = normalizeProduct(node);
      if (!data.id) continue;
      const event = await ingestNormalized({
        connection,
        topic: "products/update",
        data,
        identity: data.id,
      });
      if (event.duplicate) duplicates += 1;
      else ingested += 1;
    }
  }

  if (capability === "commerce.shopify.orders.read") {
    for (const node of array(providerData?.orders?.nodes)) {
      const data = normalizeOrder(node);
      if (!data.id) continue;
      const event = await ingestNormalized({
        connection,
        topic: data.cancelled_at ? "orders/cancelled" : "orders/updated",
        data,
        identity: data.id,
      });
      if (event.duplicate) duplicates += 1;
      else ingested += 1;
    }
  }

  if (capability === "commerce.shopify.inventory.read") {
    for (const node of array(providerData?.inventoryItems?.nodes)) {
      const data = normalizeInventoryItem(node);
      if (!data.id) continue;
      const event = await ingestNormalized({
        connection,
        topic: "inventory_items/update",
        data,
        identity: data.id,
      });
      if (event.duplicate) duplicates += 1;
      else ingested += 1;

      for (const level of array(node?.inventoryLevels?.nodes)) {
        const levelData = normalizeInventoryLevel(level, data.id);
        if (!levelData.location_id) continue;
        const levelEvent = await ingestNormalized({
          connection,
          topic: "inventory_levels/update",
          data: levelData,
          identity: `${data.id}:${levelData.location_id}`,
        });
        if (levelEvent.duplicate) duplicates += 1;
        else ingested += 1;
      }
    }
  }

  if (capability === "commerce.shopify.locations.read") {
    for (const node of array(providerData?.locations?.nodes)) {
      const data = normalizeLocation(node);
      if (!data.id) continue;
      const event = await ingestNormalized({
        connection,
        topic: "locations/update",
        data,
        identity: data.id,
      });
      if (event.duplicate) duplicates += 1;
      else ingested += 1;
    }
  }

  return { ingested, duplicates };
}

function providerCollection(providerData, capability) {
  if (capability.endsWith("products.read")) return object(providerData.products);
  if (capability.endsWith("orders.read")) return object(providerData.orders);
  if (capability.endsWith("inventory.read")) return object(providerData.inventoryItems);
  if (capability.endsWith("locations.read")) return object(providerData.locations);
  return {};
}

async function reconcileCapability({ connection, capability, currency, reset = false }) {
  const key = capabilityKey(capability);
  const current = reset ? {} : capabilityState(connection, capability);
  if (current.complete === true && !reset) {
    return { skipped: true, capability, key, complete: true, connection };
  }

  const result = await executeService({
    organization_id: connection.organization_id,
    service_id: "online-store",
    provider_id: "shopify",
    capability,
    currency,
    input: {
      currency,
      quantity: 1,
      first: 50,
      after: text(current.cursor) || null,
    },
    metadata: {
      source: "SHOPIFY_RECONCILIATION",
      connection_id: connection.id,
      sensitive_output: true,
    },
  });

  const envelope = object(result?.output);
  const providerData = object(envelope.output);
  const collection = providerCollection(providerData, capability);
  const pageInfo = object(collection.pageInfo);
  const projected = await ingestCapabilityPage({
    connection,
    capability,
    providerData,
  });

  const metadata = object(connection.metadata);
  const reconciliation = connectionSyncState(connection);
  const nextCapability = {
    cursor: pageInfo.hasNextPage ? text(pageInfo.endCursor) || null : null,
    complete: pageInfo.hasNextPage !== true,
    last_attempt_at: new Date().toISOString(),
    last_success_at: new Date().toISOString(),
    last_error: null,
    ingested: Number(current.ingested || 0) + projected.ingested,
    duplicates: Number(current.duplicates || 0) + projected.duplicates,
    usage_id: result?.usage?.id || null,
  };

  const nextConnection = await saveConnectionSync(connection, {
    ...reconciliation,
    [key]: nextCapability,
  });

  return {
    success: true,
    capability,
    key,
    complete: nextCapability.complete,
    has_next_page: pageInfo.hasNextPage === true,
    ingested: projected.ingested,
    duplicates: projected.duplicates,
    connection: nextConnection,
  };
}

async function activeConnections(limit) {
  const result = await supabaseAdmin
    .from("organization_channel_connections")
    .select("*")
    .eq("provider", "shopify")
    .eq("channel_type", "commerce")
    .eq("status", "ACTIVE")
    .order("updated_at", { ascending: true })
    .limit(Math.max(1, Number(limit) || 5));
  if (result.error) throw result.error;
  return result.data || [];
}

export async function reconcileShopifyConnections({ connectionLimit = 5 } = {}) {
  const connections = await activeConnections(connectionLimit);
  const results = [];

  for (let connection of connections) {
    const wallet = await WalletRepository.getByOrganization(connection.organization_id);
    const currency = wallet?.currency || wallet?.default_currency || null;
    if (!currency) {
      results.push({
        success: false,
        organization_id: connection.organization_id,
        connection_id: connection.id,
        error: "ORGANIZATION_WALLET_CURRENCY_REQUIRED",
      });
      continue;
    }

    const reset = shouldReset(connection);
    if (reset) {
      connection = await saveConnectionSync(connection, {
        started_at: new Date().toISOString(),
        last_error: null,
        products: {},
        orders: {},
        inventory: {},
        locations: {},
      });
    }

    const capabilityResults = [];
    try {
      for (const capability of CAPABILITIES) {
        const result = await reconcileCapability({
          connection,
          capability,
          currency,
          reset: false,
        });
        capabilityResults.push({ ...result, connection: undefined });
        connection = result.connection || connection;
      }

      const state = connectionSyncState(connection);
      const complete = CAPABILITIES.every(
        (capability) => object(state[capabilityKey(capability)]).complete === true,
      );
      if (complete) {
        connection = await saveConnectionSync(connection, {
          ...state,
          last_full_sync_at: new Date().toISOString(),
          status: "READY",
          last_error: null,
        });
      }

      results.push({
        success: true,
        organization_id: connection.organization_id,
        connection_id: connection.id,
        complete,
        capabilities: capabilityResults,
      });
    } catch (error) {
      await saveConnectionSync(connection, {
        ...connectionSyncState(connection),
        status: "ERROR",
        last_error: error?.message || "SHOPIFY_RECONCILIATION_FAILED",
        last_attempt_at: new Date().toISOString(),
      }).catch(() => null);
      results.push({
        success: false,
        organization_id: connection.organization_id,
        connection_id: connection.id,
        error: error?.message || "SHOPIFY_RECONCILIATION_FAILED",
        capabilities: capabilityResults,
      });
    }
  }

  return {
    success: results.every((row) => row.success),
    checked: connections.length,
    failed: results.filter((row) => !row.success).length,
    results,
  };
}
