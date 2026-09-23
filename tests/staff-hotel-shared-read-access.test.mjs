import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const properties = fs.readFileSync(new URL("../app/api/hotel/properties/list/route.js", import.meta.url), "utf8");
const guests = fs.readFileSync(new URL("../app/api/hotel/guests/list/route.js", import.meta.url), "utf8");
const policy = fs.readFileSync(new URL("../lib/hotel/server/HotelOperationalAccessPolicy.js", import.meta.url), "utf8");

test("hotel property lookup is available to legitimate hotel operational roles only", () => {
  assert.match(policy, /assertAnyHotelOperationalAccess/);
  assert.match(properties, /assertAnyHotelOperationalAccess\(access\)/);
});

test("hotel guest lookup is limited to front desk or concierge and does not expose identity documents", () => {
  assert.match(guests, /canAccessHotelOperationalArea\(access, "FRONT_DESK"\)/);
  assert.match(guests, /canAccessHotelOperationalArea\(access, "CONCIERGE"\)/);
  assert.match(guests, /full_name,preferred_language,vip_status,preferences,last_stay_at/);
  assert.doesNotMatch(guests, /select\("\*"\)/);
  assert.doesNotMatch(guests, /document_number/);
  assert.doesNotMatch(guests, /document_type/);
});
