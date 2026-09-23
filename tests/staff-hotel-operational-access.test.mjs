import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const policy = fs.readFileSync(new URL("../lib/hotel/server/HotelOperationalAccessPolicy.js", import.meta.url), "utf8");
const plan = fs.readFileSync(new URL("../app/api/hotel/housekeeping/priority-plan/route.js", import.meta.url), "utf8");
const update = fs.readFileSync(new URL("../app/api/hotel/housekeeping/update/route.js", import.meta.url), "utf8");
const inspect = fs.readFileSync(new URL("../app/api/hotel/housekeeping/inspect/route.js", import.meta.url), "utf8");

test("hotel operational policy distinguishes housekeeping from other hotel roles", () => {
  assert.match(policy, /HOUSEKEEPING/);
  assert.match(policy, /FRONT_DESK/);
  assert.match(policy, /MAINTENANCE/);
  assert.match(policy, /CONCIERGE/);
  assert.match(policy, /access\.staff\?\.department/);
});

test("housekeeping read and mutation routes enforce housekeeping authority after organization authentication", () => {
  for (const source of [plan, update, inspect]) {
    assert.match(source, /requireOrganizationAccess/);
    assert.match(source, /assertHotelOperationalAccess\(\{ access, area: "HOUSEKEEPING" \}\)/);
  }
});
