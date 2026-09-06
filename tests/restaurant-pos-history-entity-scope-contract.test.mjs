import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const historyPath = "app/(system)/workspace/[organizationId]/operations/pos/history/page.jsx";
const receiptPath = "app/(system)/workspace/[organizationId]/operations/pos/receipts/page.jsx";
const legacyLoaderPath = "lib/pos/loadPaidOrders.js";

const history = fs.readFileSync(historyPath, "utf8");
const receipts = fs.readFileSync(receiptPath, "utf8");

test("legacy POS history delegates to canonical receipts", () => {
  assert.match(history, /ReceiptsPage/);
  assert.match(history, /data-pos-history-canonical-receipts="true"/);
  assert.doesNotMatch(history, /loadPaidOrders/);
});

test("canonical receipts are legal-entity scoped", () => {
  assert.match(receipts, /entityId/);
  assert.match(receipts, /query\.set\("entityId", entityId\)/);
  assert.match(receipts, /Select a legal entity before loading POS receipts/);
});

test("legacy organization-scoped paid-order loader is removed", () => {
  assert.equal(fs.existsSync(legacyLoaderPath), false);
});
