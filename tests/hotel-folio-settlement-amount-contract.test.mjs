import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const payments = fs.readFileSync("app/(system)/workspace/[organizationId]/operations/hotel-payments/page.jsx", "utf8");
const stays = fs.readFileSync("app/api/hotel/stays/route.js", "utf8");

test("Hotel Payments derives the live signed folio balance from active folio lines", () => {
  assert.match(payments, /stays\.folios/);
  assert.match(payments, /stays\.folioLines/);
  assert.match(payments, /!line\.voided_at/);
  assert.match(payments, /Number\(line\.amount \|\| 0\) \+ Number\(line\.tax_amount \|\| 0\)/);
  assert.match(stays, /folios, folioLines/);
});

test("stay payment defaults to folio amount due before reservation arithmetic", () => {
  assert.match(payments, /transactionType === "PAYMENT" && hasFolio \? openFolioAmountDue : reservationOutstanding/);
  assert.match(payments, /Settlement amount is anchored to the live folio balance/);
  assert.match(payments, /Reservation total and applied gateway amounts remain visible as supporting evidence, not the amount-due authority/);
});

test("guest credit cannot silently become another stay collection", () => {
  assert.match(payments, /folioBalance < -FOLIO_EPSILON/);
  assert.match(payments, /This folio has a guest credit/);
  assert.match(payments, /Resolve guest credit/);
  assert.match(payments, /paymentBlockedByFolio/);
});
