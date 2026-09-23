import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function source(path) { return fs.readFileSync(new URL(path, import.meta.url), "utf8"); }
const maintenance = [
  "../app/api/hotel/maintenance/list/route.js",
  "../app/api/hotel/maintenance/requests/route.js",
  "../app/api/hotel/maintenance/create/route.js",
  "../app/api/hotel/maintenance/update/route.js",
].map(source);
const concierge = [
  "../app/api/hotel/concierge/list/route.js",
  "../app/api/hotel/concierge/create/route.js",
  "../app/api/hotel/concierge/update/route.js",
].map(source);

test("maintenance APIs enforce maintenance operational authority", () => {
  for (const route of maintenance) {
    assert.match(route, /requireOrganizationAccess/);
    assert.match(route, /assertHotelOperationalAccess\(\{ access, area: "MAINTENANCE" \}\)/);
  }
  assert.ok((maintenance[1].match(/area: "MAINTENANCE"/g) || []).length >= 2);
});

test("concierge APIs enforce concierge operational authority", () => {
  for (const route of concierge) {
    assert.match(route, /requireOrganizationAccess/);
    assert.match(route, /assertHotelOperationalAccess\(\{ access, area: "CONCIERGE" \}\)/);
  }
});
