import RestaurantPOSAdapter from "@/lib/operations/commerce/adapters/restaurant/RestaurantPOSAdapter";
import RestaurantFulfillmentAdapter from "@/lib/operations/commerce/adapters/restaurant/RestaurantFulfillmentAdapter";
import RestaurantPOSRuntimeAdapter from "@/lib/operations/commerce/adapters/restaurant/RestaurantPOSRuntimeAdapter";
import RestaurantOrderQueryAdapter from "@/lib/operations/commerce/adapters/restaurant/RestaurantOrderQueryAdapter";
import RestaurantContextSessionAdapter from "@/lib/operations/commerce/adapters/restaurant/RestaurantContextSessionAdapter";
import RestaurantReceiptAdapter from "@/lib/operations/commerce/adapters/restaurant/RestaurantReceiptAdapter";
import RestaurantServiceActionAdapter from "@/lib/operations/commerce/adapters/restaurant/RestaurantServiceActionAdapter";
import RetailPOSReadinessAdapter from "@/lib/operations/commerce/adapters/retail/RetailPOSReadinessAdapter";
import POSCashSessionAdapter from "@/lib/operations/commerce/adapters/shared/POSCashSessionAdapter";

function normalizeApplicationId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const APPLICATIONS = Object.freeze([
  Object.freeze({
    id: "restaurant",
    name: "Restaurant Service",
    aliases: Object.freeze([
      "restaurant",
      "restaurant_service",
      "restaurant_bar",
      "bar_restaurant",
      "food_and_beverage",
      "food_beverage",
      "cafe",
      "cafe_restaurant",
      "bar",
    ]),
    status: "active",
    presentation: Object.freeze({
      contextSingular: "Table",
      contextPlural: "Tables",
      emptyPayables: "No unpaid restaurant orders.",
      orderEyebrow: "Restaurant Operations",
      receiptEyebrow: "Restaurant Operations",
      cashControlEyebrow: "Restaurant Operations",
      serviceLabel: "Waiter",
    }),
    adapter: Object.freeze({
      ...RestaurantPOSAdapter,
      runtime: RestaurantPOSRuntimeAdapter,
      orders: RestaurantOrderQueryAdapter,
      contexts: RestaurantContextSessionAdapter,
      contextActions: RestaurantServiceActionAdapter,
      receipts: RestaurantReceiptAdapter,
      cashSessions: POSCashSessionAdapter,
      fulfillment: RestaurantFulfillmentAdapter,
    }),
  }),
  Object.freeze({
    id: "retail",
    name: "Retail Selling",
    aliases: Object.freeze([
      "retail",
      "retail_store",
      "store",
      "shop",
      "boutique",
      "supermarket",
    ]),
    status: "configuration_required",
    presentation: Object.freeze({
      contextSingular: "Sale",
      contextPlural: "Sales",
      emptyPayables: "No unpaid retail sales.",
      orderEyebrow: "Retail Operations",
      receiptEyebrow: "Retail Operations",
      cashControlEyebrow: "Retail Operations",
      serviceLabel: null,
    }),
    adapter: Object.freeze({
      runtime: RetailPOSReadinessAdapter,
      cashSessions: POSCashSessionAdapter,
    }),
  }),
]);

const APPLICATION_BY_ALIAS = Object.freeze(
  Object.fromEntries(
    APPLICATIONS.flatMap((application) =>
      [application.id, ...(application.aliases || [])].map((alias) => [
        normalizeApplicationId(alias),
        application,
      ])
    )
  )
);

export function resolvePOSApplicationDefinition({
  organization,
  settings,
  requestedApplicationId,
} = {}) {
  const candidates = [
    requestedApplicationId,
    settings?.application_id,
    settings?.applicationId,
    settings?.operations_application,
    settings?.industry_application,
    organization?.operations_application,
    organization?.industry_application,
    organization?.organization_type,
    organization?.type,
    organization?.industry,
  ]
    .map(normalizeApplicationId)
    .filter(Boolean);

  for (const candidate of candidates) {
    const application = APPLICATION_BY_ALIAS[candidate];
    if (application) return application;
  }

  return null;
}

export function listPOSApplications() {
  return APPLICATIONS.map(({ adapter, ...application }) => application);
}

export { normalizeApplicationId };

export default APPLICATIONS;
