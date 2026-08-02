import RestaurantPOSAdapter from "@/lib/operations/commerce/adapters/restaurant/RestaurantPOSAdapter";

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
    adapter: RestaurantPOSAdapter,
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
