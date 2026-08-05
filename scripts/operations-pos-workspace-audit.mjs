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

const configuration = read(
  "lib/operations/commerce/POSWorkspaceConfiguration.js",
);
const workspace = read(
  "app/(system)/workspace/[organizationId]/operations/pos/POSWorkspace.jsx",
);
const registry = read(
  "lib/operations/registry/OperationsWorkspaceRegistry.js",
);
const orderEntry = read(
  "app/(system)/workspace/[organizationId]/operations/pos/waiter/POS_FINAL_UI.jsx",
);
const waiterService = read(
  "app/(system)/workspace/[organizationId]/operations/pos/waiter/WaiterServiceWorkspace.jsx",
);
const actionPolicy = read(
  "lib/operations/commerce/security/POSActionPolicy.js",
);
const actionAdapter = read(
  "lib/operations/commerce/adapters/restaurant/RestaurantServiceActionAdapter.js",
);
const paymentSettlement = read(
  "lib/operations/commerce/server/settlePOSPaymentRequest.js",
);
const checkout = read(
  "app/(system)/workspace/[organizationId]/operations/pos/PaymentWorkspace.jsx",
);
const orders = read(
  "app/(system)/workspace/[organizationId]/operations/pos/orders/page.jsx",
);
const receipts = read(
  "app/(system)/workspace/[organizationId]/operations/pos/receipts/page.jsx",
);
const cashControl = read(
  "app/(system)/workspace/[organizationId]/operations/pos/shifts/page.jsx",
);
const fulfillment = read(
  "components/workspace/operations/FulfillmentDispatchWorkspace.jsx",
);

requireIncludes(configuration, [
  'id: "sell"',
  'id: "orders"',
  'id: "checkout"',
  'id: "receipts"',
  'id: "cash-control"',
  'id: "fulfillment"',
  'component: "restaurant-order-entry"',
  'component: "restaurant-context-control"',
  'component: "restaurant-checkout"',
  'component: "restaurant-orders"',
  'component: "restaurant-receipts"',
  'component: "restaurant-cash-control"',
  'component: "restaurant-fulfillment"',
  'component: "restaurant-service"',
], "POS workspace configuration");

requireIncludes(workspace, [
  "POSFinalUI",
  "WaiterServiceWorkspace",
  "StationaryPOSUI",
  "PaymentWorkspace",
  "POSOrdersPage",
  "ReceiptsPage",
  "ShiftPage",
  "FulfillmentDispatchWorkspace",
  '"restaurant-order-entry": POSFinalUI',
  '"restaurant-service": WaiterServiceWorkspace',
  '"restaurant-context-control": StationaryPOSUI',
  '"restaurant-checkout": PaymentWorkspace',
  '"restaurant-orders": POSOrdersPage',
  '"restaurant-receipts": ReceiptsPage',
  '"restaurant-cash-control": ShiftPage',
  '"restaurant-fulfillment": FulfillmentDispatchWorkspace',
  "configuration.modes.map",
  "data-capability",
], "Stationary POS workspace");

for (const route of [
  '/operations/pos',
  '/operations/pos?view=sell',
  '/operations/pos?view=checkout',
  '/operations/pos?view=receipts',
  '/operations/pos?view=cash-control',
  '/operations/pos?view=fulfillment',
]) {
  requireIncludes(registry, [route], "Operations commerce routing");
}

requireIncludes(orderEntry, [
  "cart",
  "createCustomer",
  "confirmGuests",
  "orderRequestKey",
  "modifierDraft",
], "Stationary order entry");

requireIncludes(waiterService, [
  "onPointerDown",
  "onPointerUp",
  "LONG_PRESS_MS",
  "Tap a table to order. Hold a table for controlled actions.",
  "isMerged",
  "isOccupied",
  "isEmpty",
  "emptyDestinations",
  "Move Complete Table",
  "Move Guest",
  "Merge Tables",
  "Close & Release Table",
  'posAction("CLOSE_TABLE"',
  'view: "checkout"',
  "canExecutePOSAction",
  "REFRESH_MS",
], "Waiter service action menu");

requireIncludes(actionPolicy, [
  "ACTION_POLICY",
  "ORDER_ENTRY",
  "PAYMENT",
  "TRANSFER_TABLE",
  "MERGE_TABLES",
  "CLOSE_TABLE",
  "assertPOSActionAllowed",
  "canExecutePOSAction",
], "POS action permission policy");

requireIncludes(actionAdapter, [
  "assertPOSActionAllowed",
  "POLICY_ACTIONS",
  'action: policyAction',
], "Restaurant context action authorization");

requireIncludes(paymentSettlement, [
  "assertPOSActionAllowed",
  'action: "PAYMENT"',
], "POS payment authorization");

requireIncludes(checkout, [
  'value: "CARD"',
  'value: "CASH"',
  'value: "QR"',
  'value: "TRANSFER"',
  'value: "MIXED"',
  "Pay Selected Items",
  "Pay Partial Amount",
  "Pay Full Balance",
  "/api/pos/payments/settle",
], "Stationary checkout");

requireIncludes(orders, [
  '"ACTIVE"',
  '"COMPLETED"',
  '"ALL"',
  "Open Payment",
], "Stationary order control");

requireIncludes(receipts, [
  "/api/pos/receipts",
], "Stationary receipts");

requireIncludes(cashControl, [
  "/api/pos/cash-sessions",
], "Stationary cash control");

requireIncludes(fulfillment, [
  "/api/operations/fulfillment",
  "updateItem",
], "Stationary fulfillment");

console.log("OPERATIONS_POS_WORKSPACE_AUDIT=PASS");
console.log("STATIONARY_POS=ORDER_ENTRY,ORDERS,CHECKOUT,PAYMENTS,RECEIPTS,CASH_CONTROL,FULFILLMENT");
console.log("WAITER_SERVICE=POINTER_SAFE,STATE_AWARE,PERMISSION_GATED,AUTO_REFRESH");
console.log("OPERATIONS_COMMERCE_ROUTE=/operations/pos");
