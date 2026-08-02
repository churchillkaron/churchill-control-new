import RestaurantPOSAdapter from "@/lib/operations/commerce/adapters/restaurant/RestaurantPOSAdapter";
import RestaurantFulfillmentAdapter from "@/lib/operations/commerce/adapters/restaurant/RestaurantFulfillmentAdapter";
import RestaurantPOSRuntimeAdapter from "@/lib/operations/commerce/adapters/restaurant/RestaurantPOSRuntimeAdapter";
import RestaurantOrderQueryAdapter from "@/lib/operations/commerce/adapters/restaurant/RestaurantOrderQueryAdapter";
import RestaurantContextSessionAdapter from "@/lib/operations/commerce/adapters/restaurant/RestaurantContextSessionAdapter";

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
      "restaurant_bar",
      "bar_restaurant",
      "food_and_beverage",
      "food_beverage",
      "cafe",
      "cafe_restaurant",
      "bar",
    ]),
    presentation: Object.freeze({
      contextSingular: "Table",
      contextPlural: "Tables",
      emptyPayables: "No unpaid restaurant orders.",
      orderEyebrow: "Restaurant Operations",
    }),
    adapter: Object.freeze({
      ...RestaurantPOSAdapter,
      runtime: RestaurantPOSRuntimeAdapter,
      orders: RestaurantOrderQueryAdapter,
      contexts: RestaurantContextSessionAdapter,
      fulfillment: RestaurantFulfillmentAdapter,
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
