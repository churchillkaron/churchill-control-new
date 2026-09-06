import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const tableRuntime = fs.readFileSync(
  "lib/restaurant/pos/capabilities/tableActions/tableCommandRuntime.js",
  "utf8"
);
const migration = fs.readFileSync(
  "supabase/migrations/20260906184200_restaurant_cash_tender_evidence.sql",
  "utf8"
);
const receiptAdapter = fs.readFileSync(
  "lib/operations/commerce/adapters/restaurant/RestaurantReceiptAdapter.js",
  "utf8"
);
const receiptsPage = fs.readFileSync(
  "app/(system)/workspace/[organizationId]/operations/pos/receipts/page.jsx",
  "utf8"
);

test("restaurant table closure is legal-entity bound", () => {
  assert.match(tableRuntime, /requireValue\([\s\S]*entityId/);
  assert.match(tableRuntime, /restaurant_close_table_entity_atomic/);
  assert.match(tableRuntime, /p_entity_id:\s*entityId/);

  assert.match(
    migration,
    /create or replace function public\.restaurant_close_table_entity_atomic\(/
  );
  assert.match(migration, /p_entity_id uuid/);
  assert.match(migration, /s\.entity_id = p_entity_id/);
  assert.match(migration, /o\.entity_id = p_entity_id/);
  assert.match(
    migration,
    /This physical table still has active service for another legal entity/
  );
});

test("only governed COMP evidence can close a zero-due unpaid check", () => {
  assert.match(migration, /coalesce\(o\.total_amount, o\.total, 0\) <= 0\.01/);
  assert.match(migration, /coalesce\(o\.amount_paid, 0\) <= 0\.01/);
  assert.match(migration, /upper\(coalesce\(o\.payment_status, 'UNPAID'\)\) = 'UNPAID'/);
  assert.match(migration, /upper\(c\.correction_type\) = 'COMP'/);
  assert.match(migration, /set status = 'CLOSED'/);
  assert.doesNotMatch(migration, /set[\s\S]{0,120}payment_status = 'PAID'/);
});

test("zero-due COMP records are never inferred as paid from 0 >= 0", () => {
  assert.match(receiptAdapter, /NO_PAYMENT_DUE/);
  assert.match(receiptAdapter, /payment_evidence_present/);
  assert.match(receiptAdapter, /SETTLED_PAYMENT_STATUSES/);
  assert.match(receiptAdapter, /hasCompEvidence/);
  assert.doesNotMatch(receiptAdapter, /paid >= total - 0\.01 \|\|/);
});

test("settlement history explains no-payment-due and preserves COMP reason", () => {
  assert.match(receiptsPage, /Settlement Records/);
  assert.match(receiptsPage, /No payment due/);
  assert.match(receiptsPage, /No payment was collected/);
  assert.match(receiptsPage, /Comped · not charged/);
  assert.match(receiptsPage, /item\.correction\?\.reason/);
  assert.match(receiptsPage, /data-no-payment-due-record="true"/);
});
