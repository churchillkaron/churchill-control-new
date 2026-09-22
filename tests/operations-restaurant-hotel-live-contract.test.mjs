import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const restaurantPage = fs.readFileSync("app/(system)/workspace/[organizationId]/restaurant/page.jsx", "utf8");
const restaurantApi = fs.readFileSync("app/api/restaurant/operations/route.js", "utf8");
const concierge = fs.readFileSync("app/api/hotel/concierge/list/route.js", "utf8");

test("Restaurant Control reads canonical restaurant operations runtime", () => {
  assert.match(restaurantPage, /\/api\/restaurant\/operations/);
  assert.doesNotMatch(restaurantPage, /\/api\/workspace\/command-center/);
  assert.match(restaurantPage, /metricsFromRestaurantRuntime/);
  assert.match(restaurantPage, /lowStockAlerts:\s*null/);
  assert.match(restaurantApi, /sourceHealth/);
});

test("Hotel concierge avoids nonexistent implicit guest relationship", () => {
  assert.match(concierge, /from\("hotel_concierge_requests"\)/);
  assert.match(concierge, /from\("hotel_guests"\)/);
  assert.match(concierge, /guestById/);
  assert.doesNotMatch(concierge, /hotel_guests\s*\(\s*full_name/);
  assert.match(concierge, /hotel_properties\s*\(/);
});
