import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const stayControl = fs.readFileSync(
  new URL("../app/(system)/workspace/[organizationId]/operations/stay-control/page.jsx", import.meta.url),
  "utf8",
);
const hotelPayments = fs.readFileSync(
  new URL("../app/(system)/workspace/[organizationId]/operations/hotel-payments/page.jsx", import.meta.url),
  "utf8",
);

test("Hotel stay control resolves exact property and booking deep links", () => {
  assert.match(stayControl, /useSearchParams/);
  assert.match(stayControl, /searchParams\?\.get\("propertyId"\)/);
  assert.match(stayControl, /searchParams\?\.get\("bookingId"\)/);
  assert.match(stayControl, /list\.some\(\(item\) => item\.id === requestedPropertyId\)/);
  assert.match(stayControl, /payload\.bookings\?\.some\(\(booking\) => booking\.id === requestedBookingId\)/);
});

test("Hotel payments resolves exact property before exact booking deep link", () => {
  assert.match(hotelPayments, /searchParams\?\.get\("propertyId"\)/);
  assert.match(hotelPayments, /searchParams\?\.get\("bookingId"\)/);
  assert.match(hotelPayments, /list\.some\(\(item\) => item\.id === requestedPropertyId\)/);
  assert.match(hotelPayments, /stayPayload\.bookings\?\.some\(\(item\) => item\.id === requestedBookingId\)/);
});
