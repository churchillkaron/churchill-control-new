import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const adapter = fs.readFileSync(
  "lib/operations/commerce/adapters/restaurant/RestaurantReceiptAdapter.js",
  "utf8"
);
const page = fs.readFileSync(
  "app/(system)/workspace/[organizationId]/operations/pos/receipts/page.jsx",
  "utf8"
);

test("voided and cancelled restaurant items remain visible but non-billable", () => {
  assert.match(adapter, /NON_BILLABLE_ITEM_STATUSES/);
  assert.match(adapter, /"VOID"/);
  assert.match(adapter, /"VOIDED"/);
  assert.match(adapter, /"CANCELLED"/);
  assert.match(adapter, /original_total/);
  assert.match(adapter, /billable/);
  assert.match(adapter, /total: billable \? originalAmount : 0/);
});

test("receipt UI distinguishes retained audit history from charged lines", () => {
  assert.match(page, /Voided · not charged/);
  assert.match(page, /Cancelled · not charged/);
  assert.match(page, /data-receipt-item-billable/);
  assert.match(page, /line-through/);
  assert.match(page, /original_total/);
});
