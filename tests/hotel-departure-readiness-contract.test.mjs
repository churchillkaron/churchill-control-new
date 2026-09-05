import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const readiness = fs.readFileSync(
  new URL("../lib/hotel/server/getHotelDepartureReadiness.js", import.meta.url),
  "utf8",
);
const bookingTransition = fs.readFileSync(
  new URL("../lib/hotel/server/transitionHotelBooking.js", import.meta.url),
  "utf8",
);
const bookingList = fs.readFileSync(
  new URL("../app/api/hotel/bookings/list/route.js", import.meta.url),
  "utf8",
);
const stays = fs.readFileSync(
  new URL("../app/api/hotel/stays/route.js", import.meta.url),
  "utf8",
);
const frontDesk = fs.readFileSync(
  new URL("../app/(system)/workspace/[organizationId]/operations/front-desk/page.jsx", import.meta.url),
  "utf8",
);

test("Hotel departure readiness fails closed on unfinished settlement and open folios", () => {
  assert.match(readiness, /PAYMENT_PENDING/);
  assert.match(readiness, /FINANCE_EVIDENCE_MISSING/);
  assert.match(readiness, /FOLIO_BALANCE_OPEN/);
  assert.match(readiness, /FOLIO_OPEN_ZERO_BALANCE/);
  assert.match(readiness, /can_check_out/);
});

test("Hotel checkout server independently re-reads governed departure evidence", () => {
  assert.match(bookingTransition, /evaluateHotelDepartureReadiness/);
  assert.match(bookingTransition, /firstHotelDepartureBlockerMessage/);
  assert.match(bookingTransition, /hotel_payment_transactions/);
  assert.match(bookingTransition, /hotel_folio_lines/);
  assert.match(bookingTransition, /if \(!readiness\.can_check_out\)/);
});

test("Hotel booking feed exposes departure readiness from folio and payment evidence", () => {
  assert.match(bookingList, /departure_readiness: evaluateHotelDepartureReadiness/);
  assert.match(bookingList, /hotel_payment_transactions/);
  assert.match(bookingList, /hotel_folio_lines/);
});

test("Folio close cannot strand an unfinished gateway transaction", () => {
  assert.match(stays, /getUnfinishedSettlement/);
  assert.match(stays, /Wait for pending Hotel payment\/refund settlement before closing the folio/);
  assert.match(stays, /Settled gateway transaction is missing Finance evidence/);
});

test("Front Desk resolves departure exceptions before checkout", () => {
  assert.match(frontDesk, /Close folio/);
  assert.match(frontDesk, /Settle folio/);
  assert.match(frontDesk, /Review settlement/);
  assert.match(frontDesk, /departure_readiness/);
  assert.match(frontDesk, /can_check_out/);
});
