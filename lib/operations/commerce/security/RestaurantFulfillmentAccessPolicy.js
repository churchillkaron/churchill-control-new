import { getPOSAccessSnapshot } from "@/lib/operations/commerce/security/POSActionPolicy";

const KITCHEN_SOURCE = "restaurant_kitchen_ticket";
const BAR_SOURCE = "restaurant_bar_ticket";

const FULL_ROLES = new Set([
  "OWNER", "ORGANIZATION_OWNER", "ORG_OWNER", "PLATFORM_OWNER", "SUPER_ADMIN", "ADMIN",
  "MANAGER", "GENERAL_MANAGER", "DUTY_MANAGER", "SUPERVISOR", "SHIFT_MANAGER",
  "RESTAURANT_MANAGER", "VENUE_MANAGER",
]);
const KITCHEN_ROLES = new Set(["KITCHEN", "CHEF", "COOK", "SOUS_CHEF", "HEAD_CHEF"]);
const BAR_ROLES = new Set(["BAR", "BARTENDER", "HEAD_BARTENDER", "BAR_MANAGER"]);

function permissionMatches(granted, required) {
  const actual = String(granted || "").trim().toLowerCase();
  const expected = String(required || "").trim().toLowerCase();
  if (!actual || !expected) return false;
  if (actual === "*" || actual === expected) return true;
  if (actual.endsWith(".*")) return expected.startsWith(actual.slice(0, -1));
  return false;
}

function hasAnyPermission(permissions, required) {
  return permissions.some((granted) => required.some((candidate) => permissionMatches(granted, candidate)));
}

export function allowedRestaurantFulfillmentSourceTypes(access) {
  const snapshot = getPOSAccessSnapshot(access);
  if (!snapshot.authenticated) return [];
  if (FULL_ROLES.has(snapshot.role)) return [KITCHEN_SOURCE, BAR_SOURCE];

  const allowed = new Set();
  if (KITCHEN_ROLES.has(snapshot.role)) allowed.add(KITCHEN_SOURCE);
  if (BAR_ROLES.has(snapshot.role)) allowed.add(BAR_SOURCE);

  if (hasAnyPermission(snapshot.permissions, ["operations.*", "restaurant.*", "operations.fulfillment.*"])) {
    allowed.add(KITCHEN_SOURCE);
    allowed.add(BAR_SOURCE);
  }
  if (hasAnyPermission(snapshot.permissions, ["operations.kitchen.*", "restaurant.kitchen.*"])) {
    allowed.add(KITCHEN_SOURCE);
  }
  if (hasAnyPermission(snapshot.permissions, ["operations.bar.*", "restaurant.bar.*"])) {
    allowed.add(BAR_SOURCE);
  }
  return [...allowed];
}

export function assertRestaurantFulfillmentAccess({ access, sourceType = null } = {}) {
  const allowed = allowedRestaurantFulfillmentSourceTypes(access);
  if (!allowed.length) {
    const error = new Error("Restaurant fulfillment access denied");
    error.status = 403;
    throw error;
  }
  if (sourceType && !allowed.includes(String(sourceType).trim().toLowerCase())) {
    const error = new Error("Restaurant fulfillment source access denied");
    error.status = 403;
    throw error;
  }
  return allowed;
}

export default Object.freeze({
  allowedRestaurantFulfillmentSourceTypes,
  assertRestaurantFulfillmentAccess,
});
