import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const paths = Object.freeze({
  registry: "app/(system)/workspace/[organizationId]/operations/pos/POSApplicationSurfaceRegistry.jsx",
  shell: "app/(system)/workspace/[organizationId]/operations/pos/StationaryPOS_UI.jsx",
  checkout: "app/(system)/workspace/[organizationId]/operations/pos/POSInlineCheckout.jsx",
  waiter: "app/(system)/workspace/[organizationId]/operations/pos/RestaurantWaiterPhoneSurface.jsx",
  stationary: "app/(system)/workspace/[organizationId]/operations/pos/RestaurantStationaryOrderSurface.jsx",
  correctionSurface: "app/(system)/workspace/[organizationId]/operations/pos/RestaurantPaymentCorrections.jsx",
  floor: "app/(system)/workspace/[organizationId]/operations/tables/page.jsx",
  kitchen: "components/workspace/operations/RestaurantKitchenDisplay.jsx",
  expo: "components/workspace/operations/RestaurantExpoPass.jsx",
  expoPage: "app/(system)/workspace/[organizationId]/operations/expo/page.jsx",
  theme: "components/workspace/operations/RestaurantAvantiqoTheme.jsx",
  tablesLayout: "app/(system)/workspace/[organizationId]/operations/tables/layout.jsx",
  kitchenLayout: "app/(system)/workspace/[organizationId]/operations/kitchen/layout.jsx",
  expoLayout: "app/(system)/workspace/[organizationId]/operations/expo/layout.jsx",
  restaurantAdapter: "lib/operations/commerce/adapters/restaurant/RestaurantPOSAdapter.js",
  serviceActionAdapter: "lib/operations/commerce/adapters/restaurant/RestaurantServiceActionAdapter.js",
  tableCommandRuntime: "lib/restaurant/pos/capabilities/tableActions/tableCommandRuntime.js",
  paymentCorrectionAdapter: "lib/operations/commerce/adapters/shared/POSPaymentCorrectionAdapter.js",
  paymentCorrectionRoute: "app/api/pos/payment-corrections/route.js",
});

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("restaurant uses the current Avantiqo visual system across human work surfaces", async () => {
  const theme = await source(paths.theme);
  const registry = await source(paths.registry);
  const shell = await source(paths.shell);
  const tablesLayout = await source(paths.tablesLayout);
  const kitchenLayout = await source(paths.kitchenLayout);
  const expoLayout = await source(paths.expoLayout);

  assert.match(theme, /#f7f6f3/i);
  assert.match(theme, /#ffffff/i);
  assert.match(theme, /#a37849/i);
  assert.match(theme, /rgba\(0, 0, 0, 0\.075\)/);
  assert.match(theme, /data-avantiqo-restaurant-theme/);
  assert.match(registry, /RestaurantAvantiqoTheme/);
  assert.match(registry, /orders: RestaurantOrdersSurface/);
  assert.match(registry, /receipts: RestaurantReceiptsSurface/);
  assert.match(registry, /cash: RestaurantCashSurface/);
  assert.match(shell, /data-avantiqo-pos-shell=\{isRestaurant \? "light" : "dark"\}/);
  assert.match(shell, /bg-\[#F7F6F3\]/);
  assert.match(shell, /bg-\[#25231F\]/);
  assert.match(tablesLayout, /RestaurantAvantiqoTheme mode="service"/);
  assert.match(kitchenLayout, /RestaurantAvantiqoTheme mode="production"/);
  assert.match(expoLayout, /RestaurantAvantiqoTheme mode="production"/);

  assert.match(theme, /article\[class\*="bg-red-"\]/);
  assert.match(theme, /background-color: rgba\(239, 68, 68, 0\.075\) !important/);
  assert.match(theme, /article\[class\*="bg-amber-"\]/);
  assert.match(theme, /background-color: rgba\(245, 158, 11, 0\.08\) !important/);
  assert.match(theme, /color: #991b1b !important/);
  assert.match(theme, /color: #92400e !important/);
  assert.match(theme, /color: #047857 !important/);
});

test("restaurant canonical adapter owns the governed context actions", async () => {
  const adapter = await source(paths.restaurantAdapter);
  const actions = await source(paths.serviceActionAdapter);

  assert.match(adapter, /RestaurantServiceActionAdapter/);
  assert.match(adapter, /contextActions:\s*RestaurantServiceActionAdapter/);
  assert.match(actions, /assertPOSActionAllowed/);
  assert.match(actions, /TRANSFER_TABLE/);
  assert.match(actions, /MERGE_TABLES/);
  assert.match(actions, /MOVE_GUESTS/);
});

test("restaurant whole-table transfer requires a truly free destination", async () => {
  const runtime = await source(paths.tableCommandRuntime);

  assert.match(runtime, /tableUnavailableForTransfer/);
  assert.match(runtime, /active_session_id/);
  assert.match(runtime, /current_guests/);
  assert.match(runtime, /OUT_OF_SERVICE/);
  assert.match(runtime, /Choose an empty available table or merge services instead/);
  assert.match(runtime, /error\.status = 409/);
});

test("restaurant payment corrections are governed, manager-only, auditable and original-preserving", async () => {
  const adapter = await source(paths.restaurantAdapter);
  const correction = await source(paths.paymentCorrectionAdapter);
  const route = await source(paths.paymentCorrectionRoute);
  const surface = await source(paths.correctionSurface);
  const registry = await source(paths.registry);

  assert.match(adapter, /POSPaymentCorrectionAdapter/);
  assert.match(adapter, /paymentCorrections:\s*POSPaymentCorrectionAdapter/);
  assert.match(route, /paymentCorrections\.load/);
  assert.match(route, /paymentCorrections\.execute/);
  assert.match(correction, /Manager or owner role required for POS payment corrections/);
  assert.match(correction, /correctionType must be REFUND or REVERSAL/);
  assert.match(correction, /Correction reason required/);
  assert.match(correction, /pos_correct_payment_atomic/);
  assert.match(correction, /pos_payment_corrections/);
  assert.match(correction, /preserves_original_payment:\s*true/);
  assert.match(correction, /cash_only:\s*true/);
  assert.match(correction, /requires_active_cash_session:\s*true/);

  assert.match(registry, /RestaurantPaymentCorrections/);
  assert.match(registry, /<RestaurantPaymentCorrections[\s\S]*refreshKey=\{checkoutVersion\}/);
  assert.match(surface, /state\?\.actor\?\.can_correct/);
  assert.match(surface, /state\?\.active_cash_session\?\.id/);
  assert.match(surface, /eligiblePayments\.length/);
  assert.match(surface, /correctionType:\s*action/);
  assert.match(surface, /reason:\s*reason\.trim\(\)/);
  assert.match(surface, /original payment is never deleted/i);
  assert.match(surface, /data-restaurant-payment-corrections="true"/);
});

test("restaurant waiter phone stays service-only", async () => {
  const waiter = await source(paths.waiter);
  const registry = await source(paths.registry);

  assert.match(registry, /RestaurantWaiterPhoneSurface/);
  assert.match(registry, /requestedView === "waiter" \|\| requestedView === "service"/);
  assert.match(registry, /settlement stays at the stationary POS/);

  assert.doesNotMatch(waiter, /\/api\/pos\/payments\/settle/);
  assert.doesNotMatch(waiter, /operations\/pos\/payments/);
  assert.doesNotMatch(waiter, /goToPayment/);
  assert.doesNotMatch(waiter, /RestaurantPaymentCorrections/);
  assert.doesNotMatch(waiter, /payment-corrections/);
});

test("restaurant stationary POS is a dedicated desktop workstation", async () => {
  const registry = await source(paths.registry);
  const stationary = await source(paths.stationary);

  assert.match(registry, /data-restaurant-stationary-pos="true"/);
  assert.match(registry, /RestaurantStationaryOrderSurface/);
  assert.match(registry, /<RestaurantStationaryOrderSurface[\s\S]*<POSInlineCheckout/);
  assert.match(registry, /payment: RestaurantSaleSurface/);
  assert.match(registry, /onActiveContextChange=\{setActiveTableReference\}/);
  assert.match(registry, /preferredContextReference=\{activeTableReference\}/);

  assert.match(stationary, /data-restaurant-stationary-order-surface="true"/);
  assert.match(stationary, /data-stationary-draft-order="true"/);
  assert.match(stationary, /Search menu/);
  assert.match(stationary, /Send to kitchen/);
  assert.match(stationary, /Change guest count/);
  assert.match(stationary, /Move whole table/);
  assert.match(stationary, /Merge tables/);
  assert.doesNotMatch(stationary, /Go to Payment/);
  assert.doesNotMatch(stationary, /operations\/pos\/payments/);
  assert.doesNotMatch(stationary, /goToPayment/);
  assert.doesNotMatch(stationary, /onMouseDown=\{\(\) => startHold/);
});

test("stationary checkout uses real split tenders and cash change", async () => {
  const checkout = await source(paths.checkout);

  assert.match(checkout, /data-stationary-payment-rail="true"/);
  assert.match(checkout, /Split tender/);
  assert.match(checkout, /Take one real tender at a time until remaining reaches zero/);
  assert.match(checkout, /data-cash-change-workflow="true"/);
  assert.match(checkout, /Cash received/);
  assert.match(checkout, /Change/);
  assert.match(checkout, /tenderedAmount/);
  assert.match(checkout, /paidAmount/);
  assert.match(checkout, /numericAmount > remainingBalance \+ 0\.01/);
  assert.doesNotMatch(checkout, /value:\s*"MIXED"/);
});

test("floor handoff targets the stationary POS with exact table context", async () => {
  const floor = await source(paths.floor);
  const checkout = await source(paths.checkout);
  const stationary = await source(paths.stationary);

  assert.match(floor, /new URLSearchParams\(\{[\s\S]*view: "stationary",[\s\S]*table: String\(tableReference\)/);
  assert.match(floor, /router\.push\(`\/workspace\/\$\{organizationId\}\/operations\/pos\?\$\{query\.toString\(\)\}`\)/);
  assert.match(checkout, /preferredContextReference = null/);
  assert.match(checkout, /contextMatchesReference\(context, preferredContextReference\)/);
  assert.match(checkout, /requestedEntry\?\.context/);
  assert.match(stationary, /preferredTableReference = null/);
  assert.match(stationary, /matchesTableReference\(table, preferred\)/);
});

test("restaurant floor stays a live overview, not a second POS", async () => {
  const floor = await source(paths.floor);

  assert.match(floor, /Restaurant Floor/);
  assert.match(floor, /Continue at stationary POS/);
  assert.match(floor, /Service detail/);
  assert.doesNotMatch(floor, /\/api\/pos\/payments\/settle/);
  assert.doesNotMatch(floor, /Send to kitchen/);
});

test("restaurant kitchen requires preparation before ready and stays production-only", async () => {
  const kitchen = await source(paths.kitchen);

  assert.match(kitchen, /restaurant_kitchen_ticket/);
  assert.match(kitchen, /No payment, floor administration or serving controls/);
  assert.match(kitchen, /"PREPARING"/);
  assert.match(kitchen, /"READY"/);
  assert.match(kitchen, /disabled=\{busy \|\| ready \|\| !cooking\}/);
  assert.match(kitchen, /Start first/);
  assert.match(kitchen, /border-red-400\/45 bg-red-500\/\[0\.07\] text-red-100/);
  assert.match(kitchen, /border-amber-300\/35 bg-amber-300\/\[0\.06\] text-amber-100/);

  assert.doesNotMatch(kitchen, /\/api\/pos\/payments\/settle/);
  assert.doesNotMatch(kitchen, /operations\/pos\/payments/);
  assert.doesNotMatch(kitchen, /status:\s*"SERVED"/);
  assert.doesNotMatch(kitchen, />\s*Pay(?:ment)?\s*</i);
});

test("restaurant expo owns exact ready-to-served physical handoff", async () => {
  const expo = await source(paths.expo);
  const expoPage = await source(paths.expoPage);

  assert.match(expoPage, /RestaurantExpoPass/);
  assert.match(expo, /scope:\s*"ready"/);
  assert.match(expo, /restaurant_kitchen_ticket/);
  assert.match(expo, /restaurant_bar_ticket/);
  assert.match(expo, /function seatOf\(item\)/);
  assert.match(expo, /item\?\.modifiers\?\.seat/);
  assert.match(expo, /data-expo-item-modifiers="true"/);
  assert.match(expo, /status:\s*"SERVED"/);
  assert.match(expo, /Only ready kitchen and bar items appear here/);
  assert.doesNotMatch(expo, /\/api\/pos\/payments\/settle/);
});