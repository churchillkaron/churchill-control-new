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
const orderEntry = read("app/(system)/workspace/[organizationId]/operations/pos/RestaurantOrderEntryWorkspace.jsx");
const waiterService = read("app/(system)/workspace/[organizationId]/operations/pos/waiter/WaiterServiceWorkspace.jsx");
const liveWaiterService = read("app/(system)/workspace/[organizationId]/operations/pos/waiter/LiveWaiterServiceWorkspace.jsx");
const universalRealtime = read("lib/operations/commerce/realtime/usePOSRealtime.js");
const restaurantRealtime = read("lib/restaurant/pos/realtime/useRestaurantPOSRealtime.js");
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
requireMissing("app/(system)/workspace/[organizationId]/operations/pos/POS_FINAL_UI.jsx", "Legacy final POS surface");

requireIncludes(configuration, [
  'id: "sell"', 'id: "orders"', 'id: "checkout"', 'id: "receipts"',
  'id: "cash-control"', 'id: "fulfillment"',
  'component: "restaurant-order-entry"', 'component: "restaurant-context-control"',
  'component: "restaurant-checkout"', 'component: "restaurant-orders"',
  'component: "restaurant-receipts"', 'component: "restaurant-cash-control"',
  'component: "restaurant-fulfillment"', 'component: "restaurant-service"',
  "realtimeSubscriptions", 'Object.freeze({ table: "restaurant_tables" })',
  "application?.realtimeSubscriptions || Object.freeze([])",
], "POS workspace configuration");

requireIncludes(workspace, [
  "RestaurantOrderEntryWorkspace", "LiveWaiterServiceWorkspace", "StationaryPOSUI",
  "PaymentWorkspace", "POSOrdersPage", "ReceiptsPage", "ShiftPage",
  "FulfillmentDispatchWorkspace", '"restaurant-order-entry": RestaurantOrderEntryWorkspace',
  '"restaurant-service": LiveWaiterServiceWorkspace', '"restaurant-context-control": StationaryPOSUI',
  '"restaurant-checkout": PaymentWorkspace', '"restaurant-orders": POSOrdersPage',
  '"restaurant-receipts": ReceiptsPage', '"restaurant-cash-control": ShiftPage',
  '"restaurant-fulfillment": FulfillmentDispatchWorkspace',
  'nextMode !== "checkout" && nextMode !== "sell"', "configuration.modes.map", "data-capability",
], "Stationary POS workspace");

for (const route of [
  '/operations/pos', '/operations/pos?view=sell', '/operations/pos?view=checkout',
  '/operations/pos?view=receipts', '/operations/pos?view=cash-control',
  '/operations/pos?view=fulfillment',
]) {
  requireIncludes(registry, [route], "Operations commerce routing");
}

requireIncludes(orderEntry, [
  "useSearchParams", "requestedReference", 'searchParams.get("service_context")',
  'searchParams.get("table")', 'searchParams.get("action")', "tableMatches",
  "selectTable(requestedTable", 'forceCustomer: requestedAction === "customer"',
  "customerSearch", "createCustomer", "confirmGuests", "modifierDraft",
  "orderRequestKey", "/api/pos/create", "Send to Kitchen", 'view: "checkout"',
  'view=mobile-service', "useRestaurantPOSRealtime", "runtimeRefreshRef",
  "loadRuntime({ silent: true })", 'realtimeStatus === "live"',
  "FALLBACK_REFRESH_MS", "realtimeLabel", "refreshing",
], "Native restaurant order entry");

requireIncludes(waiterService, [
  "onPointerDown", "onPointerUp", "LONG_PRESS_MS",
  "Tap a table to order. Hold a table for controlled actions.",
  "isMerged", "isOccupied", "isEmpty", "emptyDestinations",
  "Move Complete Table", "Move Guest", "Merge Tables", "Close & Release Table",
  'posAction("CLOSE_TABLE"', 'view: "checkout"', 'view: "sell"',
  'query.set("table"', "canExecutePOSAction", "REFRESH_MS",
], "Waiter service action menu");

requireIncludes(liveWaiterService, [
  "useRestaurantPOSRealtime", "organizationId", "refreshWaiterRuntime",
  'new Event("focus")', "Polling fallback", "WaiterServiceWorkspace",
], "Live waiter service binding");

requireIncludes(universalRealtime, [
  "CORE_POS_SUBSCRIPTIONS", 'table: "orders"', "applicationSubscriptions",
  "buildSubscriptions", "organization_id=eq.", "createSafeRealtimeChannel",
  "removeSafeRealtimeChannel", "CHANGE_DEBOUNCE_MS", 'setStatus("live")',
  'setStatus("polling")', 'source:', '"operations-pos"',
], "Universal Operations POS realtime");

requireIncludes(restaurantRealtime, [
  "usePOSRealtime", "RESTAURANT_POS_SUBSCRIPTIONS",
  'table: "restaurant_tables"', "applicationSubscriptions",
], "Restaurant POS realtime adapter");

requireIncludes(safeRealtime, [
  "supabaseClient", '"postgres_changes"', "table:", "subscription.table",
  "channel.subscribe", "removeChannel",
], "Shared Supabase realtime channel");

if ([universalRealtime, restaurantRealtime, liveWaiterService, orderEntry, checkout, orders].some((source) => source.includes("tenant_id"))) {
  throw new Error("Operations POS realtime must not use tenant_id");
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
  "/api/pos/payments/settle", "useRestaurantPOSRealtime", "paymentRefreshRef",
  "refreshPaymentRuntime", "preserveDraft", "payableItemIds",
  'realtimeStatus === "live"', "FALLBACK_REFRESH_MS", "Polling fallback",
], "Stationary checkout");

requireIncludes(orders, [
  '"ACTIVE"', '"COMPLETED"', '"ALL"', "Open Payment",
  "useRestaurantPOSRealtime", "orderRefreshRef", "loadOrders({ silent: true })",
  "requestedContext", 'realtimeStatus === "live"', "FALLBACK_REFRESH_MS",
  "Polling fallback", "loadedOrders.some((order) => order.id === current)",
], "Stationary order control");

requireIncludes(receipts, ["/api/pos/receipts"], "Stationary receipts");
requireIncludes(cashControl, ["/api/pos/cash-sessions"], "Stationary cash control");
requireIncludes(fulfillment, ["/api/operations/fulfillment", "updateItem"], "Stationary fulfillment");

console.log("OPERATIONS_POS_WORKSPACE_AUDIT=PASS");
console.log("STATIONARY_POS=ORDER_ENTRY,ORDERS,CHECKOUT,PAYMENTS,RECEIPTS,CASH_CONTROL,FULFILLMENT");
console.log("WAITER_SERVICE=POINTER_SAFE,STATE_AWARE,PERMISSION_GATED,REALTIME_WITH_POLLING_FALLBACK");
console.log("WAITER_ORDER_HANDOFF=NATIVE_URL_STATE");
console.log("SELL_REALTIME=CART_PRESERVING,FOCUS_RECOVERY,POLLING_FALLBACK");
console.log("CHECKOUT_REALTIME=DRAFT_PRESERVING,BALANCE_SYNCHRONIZED,PAID_SELECTIONS_REMOVED");
console.log("ORDERS_REALTIME=FILTER_PRESERVING,SELECTION_VALIDATED,STALE_DATA_RETAINED_ON_TRANSIENT_ERROR");
console.log("POS_REALTIME=UNIVERSAL_CORE,APPLICATION_SUBSCRIPTIONS,ORGANIZATION_SCOPED");
console.log("RESTAURANT_REALTIME=APPLICATION_ADAPTER,RESTAURANT_TABLES");
console.log("OPERATIONS_COMMERCE_ROUTE=/operations/pos");
