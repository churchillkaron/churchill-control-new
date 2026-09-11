import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

const domain = read("lib/inventory/runtime/InventoryDomainRuntime.js");
const reads = read("lib/inventory/runtime/SupplyChainVerificationReadCapabilities.js");
const po = read("lib/inventory/procurement/purchase-orders/PurchaseOrderOperatorCapability.js");
const gr = read("lib/inventory/procurement/receiving/GoodsReceiptOperatorCapability.js");
const supplier = read("lib/inventory/procurement/suppliers/SupplierOperatorCapability.js");
const batch = read("lib/inventory/production/ProductionBatchOperatorCapability.js");

test("Supply Chain registers exact read verifiers beside mutations", () => {
  for (const name of ["purchase_orders", "goods_receipts", "suppliers", "production_batches"]) {
    assert.match(domain, new RegExp(`${name}:[\\s\\S]*?read:`));
  }
});

test("exact reads are organization scoped and entity scoped when required", () => {
  assert.match(reads, /\.eq\("organization_id", organizationId\)/);
  assert.match(reads, /query = query\.eq\("entity_id", entityId\)/);
  assert.match(reads, /\.maybeSingle\(\)/);
});
test("purchase order create binds returned purchase order id", () => {
  assert.match(po, /supply_chain\.purchase_orders\.read/);
  assert.match(po, /purchase_order\.id/);
});

test("goods receipt binds returned receipt id", () => {
  assert.match(gr, /supply_chain\.goods_receipts\.read/);
  assert.match(gr, /goods_receipt\.id/);
});

test("supplier binds returned party identity", () => {
  assert.match(supplier, /supply_chain\.suppliers\.read/);
  assert.match(supplier, /party_id/);
});

test("production batch binds returned batch id", () => {
  assert.match(batch, /supply_chain\.production_batches\.read/);
  assert.match(batch, /batch\.id/);
});
