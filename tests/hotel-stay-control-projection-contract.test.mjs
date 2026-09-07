import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync("app/api/hotel/stays/route.js", "utf8");

test("room assignment invalidates after authoritative RPC before optional room projection read", () => {
  const action = route.indexOf('action === "ASSIGN_ROOM" || action === "MOVE_ROOM"');
  assert.ok(action >= 0);
  const block = route.slice(action, route.indexOf('action === "ADD_FOLIO_LINE"', action));
  const rpc = block.indexOf('rpc("hotel_assign_booking_room_guarded"');
  const broadcast = block.indexOf('source: "stay-control-room-assignment"');
  const projection = block.indexOf('.from("hotel_rooms")');
  assert.ok(rpc >= 0 && broadcast > rpc && projection > broadcast);
  assert.match(block, /projectionWarning/);
  assert.match(block, /HOTEL_ROOM_ASSIGNMENT_PROJECTION_READ_FAILED/);
  assert.match(block, /success: true/);
});

test("folio line invalidates immediately after committed insert and projection failure is non-destructive", () => {
  const action = route.indexOf('action === "ADD_FOLIO_LINE"');
  assert.ok(action >= 0);
  const block = route.slice(action, route.indexOf('action === "CLOSE_FOLIO"', action));
  const insert = block.indexOf('.from("hotel_folio_lines").insert');
  const broadcast = block.indexOf('source: "stay-control-folio"');
  const projection = block.indexOf('getFolioBalance(auth.organizationId, booking.id)', broadcast);
  assert.ok(insert >= 0 && broadcast > insert && projection > broadcast);
  assert.match(block, /HOTEL_FOLIO_PROJECTION_READ_FAILED/);
  assert.match(block, /balance = null/);
  assert.match(block, /success: true/);
});

test("pre-arrival booking readiness changes wake other Hotel devices after persistence", () => {
  const action = route.indexOf('action === "CREATE_PRE_ARRIVAL"');
  assert.ok(action >= 0);
  const block = route.slice(action);
  const bookingWrite = block.indexOf('pre_arrival_status: "INVITED"');
  const broadcast = block.indexOf('source: "stay-control-pre-arrival"');
  assert.ok(bookingWrite >= 0 && broadcast > bookingWrite);
  assert.match(block, /action: "PRE_ARRIVAL_INVITED"/);
});
