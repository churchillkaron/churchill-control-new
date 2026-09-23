import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const routes = [
  "../app/api/hotel/arrival-readiness/ownership/route.js",
  "../app/api/hotel/housekeeping/restore-arrival-work/route.js",
  "../app/api/hotel/bookings/assign-room/route.js",
  "../app/api/hotel/bookings/list/route.js",
  "../app/api/hotel/bookings/room-options/route.js",
  "../app/api/hotel/bookings/check-in/route.js",
  "../app/api/hotel/bookings/check-out/route.js",
  "../app/api/hotel/bookings/no-show/route.js",
  "../app/api/hotel/bookings/extend/route.js",
  "../app/api/hotel/bookings/verify-identity/route.js",
  "../app/api/hotel/bookings/reinstate/route.js",
  "../app/api/hotel/stays/route.js",
].map((path) => fs.readFileSync(new URL(path, import.meta.url), "utf8"));

const policy = fs.readFileSync(new URL("../lib/hotel/server/HotelOperationalAccessPolicy.js", import.meta.url), "utf8");

test("front desk authority includes reservation and night-audit operational roles", () => {
  assert.match(policy, /RESERVATIONS/);
  assert.match(policy, /RESERVATION_AGENT/);
  assert.match(policy, /NIGHT_AUDIT/);
});

test("front desk workflow APIs require front desk authority after organization authentication", () => {
  for (const source of routes) {
    assert.match(source, /requireOrganizationAccess/);
    assert.match(source, /assertHotelOperationalAccess\(\{ access, area: "FRONT_DESK" \}\)/);
  }
});
