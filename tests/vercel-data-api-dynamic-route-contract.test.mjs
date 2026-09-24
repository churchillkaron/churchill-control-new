import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const routes = [
  "app/api/debug/customer-master/route.js",
  "app/api/health/queue/route.js",
  "app/api/health/database/route.js",
  "app/api/health/system/route.js",
  "app/api/observability/overview/route.js",
  "app/api/production/supplier-performance/live/route.js",
  "app/api/production/vendor-price-history/live/route.js",
  "app/api/production/stock-alerts/live/route.js",
];

test("database-backed health/production API routes are never statically generated", () => {
  for (const route of routes) {
    const source = fs.readFileSync(route, "utf8");
    assert.match(
      source,
      /export const dynamic = "force-dynamic";/,
      route,
    );
  }
});
