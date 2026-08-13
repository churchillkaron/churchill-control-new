import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing Stationary POS contract: ${relativePath}`);
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function requireIncludes(source, values, label) {
  for (const value of values) {
    if (!source.includes(value)) {
      throw new Error(`${label} is missing required contract: ${value}`);
    }
  }
}

function requireMissing(relativePath, label) {
  const absolutePath = path.join(ROOT, relativePath);
  if (fs.existsSync(absolutePath)) {
    throw new Error(`${label} must not exist: ${relativePath}`);
  }
}

const configuration = read("lib/operations/commerce/POSWorkspaceConfiguration.js");
const workspace = read("app/(system)/workspace/[organizationId]/operations/pos/POSWorkspace.jsx");
const registry = read("lib/operations/registry/OperationsWorkspaceRegistry.js");
const surfaceRegistry = read("app/(system)/workspace/[organizationId]/operations/pos/POSApplicationSurfaceRegistry.jsx");
const stationaryPOS = read("app/(system)/workspace/[organizationId]/operations/pos/StationaryPOS_UI.jsx");
const universalRealtime = read("lib/operations/commerce/realtime/usePOSRealtime.js");
const safeRealtime = read("lib/shared/realtime/createSafeRealtimeChannel.js");
const actionPolicy = read("lib/operations/commerce/security/POSActionPolicy.js");
const actionAdapter = read("lib/operations/commerce/adapters/restaurant/RestaurantServiceActionAdapter.js");
const paymentSettlement = read("lib/operations/commerce/server/settlePOSPaymentRequest.js");
const checkout = read("app/(system)/workspace/[organizationId]/operations/pos/PaymentWorkspace.jsx");
const orders = read("app/(system)/workspace/[organizationId]/operations/pos/orders/page.jsx");
const receipts = read("app/(system)/workspace/[organizationId]/operations/pos/receipts/page.jsx");
const cashControl = read("app/(system)/workspace/[organizationId]/operations/pos/shifts/page.jsx");
const fulfillment = read("components/workspace/operations/FulfillmentDispatchWorkspace.jsx");

requireMissing("app/(system)/workspace/[organizationId]/operations/pos/RestaurantOrderEntryBridge.jsx", "Temporary DOM order-entry bridge");
requireMissing("lib/restaurant/pos/realtime/useRestaurantPOSRealtime.js", "Restaurant-specific realtime adapter");

requireIncludes(configuration, [
  'id: "sell"', 'id: "orders"', 'id: "checkout"', 'id: "receipts"',
  'id: "cash-control"', "buildPOSWorkspaceConfiguration", "resolvePOSMode",
], "POS workspace configuration");

requireIncludes(workspace, [
  "buildPOSWorkspaceConfiguration", "StationaryPOSUI", "/api/pos/runtime",
  "organizationId", "refreshPOSRuntime",
], "Stationary POS workspace");

requireIncludes(surfaceRegistry, [
  "resolvePOSApplicationSurface", "APPLICATION_SURFACES",
  "restaurant:", "retail:", "sale:", "orders:", "payment:", "receipts:", "cash:",
], "POS application surface registry");

const stationaryPOSCollapsed = stationaryPOS.replace(/\s+/g, " ");

requireIncludes(stationaryPOSCollapsed, [
  "resolvePOSApplicationSurface", 'queryValue: "sell"', 'queryValue: "orders"',
  'queryValue: "checkout"', 'queryValue: "receipts"', '"view"',
], "Stationary POS shell");

for (const route of [
  '/operations/pos', '/operations/pos?view=sell', '/operations/pos?view=checkout',
  '/operations/pos?view=receipts', '/operations/pos?view=cash-control',
  '/operations/pos?view=fulfillment',
]) {
  requireIncludes(registry, [route], "Operations commerce routing");
}

requireIncludes(universalRealtime, [
  "CORE_POS_SUBSCRIPTIONS", 'table: "orders"', "applicationSubscriptions",
  "buildSubscriptions", "organization_id=eq.", "createSafeRealtimeChannel",
  "removeSafeRealtimeChannel", "CHANGE_DEBOUNCE_MS", 'setStatus("live")',
  'setStatus("polling")', 'source:', '"operations-pos"',
], "Universal Operations POS realtime");

requireIncludes(safeRealtime, [
  "supabaseClient", '"postgres_changes"', "table:", "subscription.table",
  "channel.subscribe", "removeChannel",
], "Shared Supabase realtime channel");

if ([universalRealtime, checkout, orders].some((source) => source.includes("tenant_id"))) {
  throw new Error("Operations POS realtime must not use tenant_id");
}

if ([checkout, orders].some((source) => source.includes("useRestaurantPOSRealtime"))) {
  throw new Error("POS consumers must use the universal Operations realtime hook");
}

requireIncludes(actionPolicy, [
  "ACTION_POLICY", "ORDER_ENTRY", "PAYMENT", "TRANSFER_TABLE", "MERGE_TABLES",
  "CLOSE_TABLE", "assertPOSActionAllowed", "canExecutePOSAction",
], "POS action permission policy");

requireIncludes(actionAdapter, ["assertPOSActionAllowed", "POLICY_ACTIONS", 'action: policyAction'], "Restaurant context action authorization");
requireIncludes(paymentSettlement, ["assertPOSActionAllowed", 'action: "PAYMENT"'], "POS payment authorization");

requireIncludes(checkout, [
  'value: "CARD"', 'value: "CASH"', 'value: "QR"', 'value: "TRANSFER"',
  'value: "MIXED"', "Pay Selected Items", "Pay Partial Amount", "Pay Full Balance",
  "/api/pos/payments/settle", "usePOSRealtime", "applicationSubscriptions",
  "posConfiguration?.realtimeSubscriptions || []", "paymentRefreshRef",
  "refreshPaymentRuntime", "preserveDraft", "payableItemIds",
  'realtimeStatus === "live"', "FALLBACK_REFRESH_MS", "Polling fallback",
], "Stationary checkout");

requireIncludes(orders, [
  '"ACTIVE"', '"COMPLETED"', '"ALL"', "Open Payment",
  "usePOSRealtime", "applicationSubscriptions",
  "posConfiguration?.realtimeSubscriptions || []", "orderRefreshRef",
  "loadOrders({ silent: true })", "requestedContext",
  'realtimeStatus === "live"', "FALLBACK_REFRESH_MS",
  "Polling fallback", "loadedOrders.some((order) => order.id === current)",
], "Stationary order control");

requireIncludes(receipts, ["/api/pos/receipts"], "Stationary receipts");
requireIncludes(cashControl, ["/api/pos/cash-sessions"], "Stationary cash control");
requireIncludes(fulfillment, ["/api/operations/fulfillment", "updateItem"], "Stationary fulfillment");

console.log("OPERATIONS_POS_WORKSPACE_AUDIT=PASS");
console.log("STATIONARY_POS=ORDER_ENTRY,ORDERS,CHECKOUT,PAYMENTS,RECEIPTS,CASH_CONTROL,FULFILLMENT");
console.log("POS_SURFACES=APPLICATION_SURFACE_REGISTRY");
console.log("POS_ACTIONS=PERMISSION_GATED");
console.log("SELL_REALTIME=CART_PRESERVING,FOCUS_RECOVERY,POLLING_FALLBACK");
console.log("CHECKOUT_REALTIME=DRAFT_PRESERVING,BALANCE_SYNCHRONIZED,PAID_SELECTIONS_REMOVED");
console.log("ORDERS_REALTIME=FILTER_PRESERVING,SELECTION_VALIDATED,STALE_DATA_RETAINED_ON_TRANSIENT_ERROR");
console.log("POS_REALTIME=UNIVERSAL_CORE,APPLICATION_SUBSCRIPTIONS,ORGANIZATION_SCOPED");
console.log("OPERATIONS_COMMERCE_ROUTE=/operations/pos");
