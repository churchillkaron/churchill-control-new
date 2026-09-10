import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

test('inventory UOM foundation is entity scoped and supports physical plus item package conversion', () => {
  const sql = read('supabase/migrations/20260910162000_inventory_uom_cost_projection_foundation.sql');
  assert.match(sql, /inventory_item_uom_conversions/);
  assert.match(sql, /factor_to_item_base/);
  assert.match(sql, /'MASS','VOLUME','COUNT','PACKAGE','OTHER'/);
  assert.match(sql, /alter table public\.dishes\s+add column if not exists entity_id/);
  assert.match(sql, /alter table public\.recipe_items\s+add column if not exists entity_id/);
  assert.match(sql, /New writes must match dish and inventory item entity/);
});

test('procurement supplier identity converges on canonical Party ids', () => {
  const sql = read('supabase/migrations/20260910161000_procurement_supplier_party_identity_convergence.sql');
  assert.match(sql, /references public\.parties \(organization_id, id\)/);
  assert.match(sql, /drop constraint if exists purchase_orders_vendor_id_fkey/);
  assert.match(sql, /drop constraint if exists goods_receipts_vendor_id_fkey/);
  assert.match(sql, /drop constraint if exists supplier_prices_vendor_id_fkey/);
});
test('supplier invoice preparation preserves exact item and UOM cost evidence', () => {
  const source = read('lib/finance/accounts-payable/runtime/VendorBillAttachmentPreparationRuntime.js');
  assert.match(source, /resolveBaseUnitCost/);
  assert.match(source, /source_item_code/);
  assert.match(source, /source_uom_text/);
  assert.match(source, /factor_to_item_base/);
  assert.match(source, /base_unit_cost/);
  assert.match(source, /cost_evidence_status/);
});

test('canonical AP creator persists cost evidence without invoking Supply Chain mutation', () => {
  const source = read('lib/finance/accounts-payable/documents/createVendorInvoice.js');
  assert.match(source, /vendor_invoice_lines/);
  assert.match(source, /cost_evidence: \{ persisted:/);
  assert.doesNotMatch(source, /supply_chain_apply_vendor_invoice_costs_atomic/);
});

test('vendor invoice cost projection is governed by procurement permission and confirmation', () => {
  const source = read('lib/inventory/costing/VendorInvoiceCostProjectionCapability.js');
  assert.match(source, /procurement\.manage/);
  assert.match(source, /operatorRequiresConfirmation:true/);
  assert.match(source, /supply_chain_apply_vendor_invoice_costs_atomic/);
});
test('atomic projector updates operational item cost and affected dishes only', () => {
  const sql = read('supabase/migrations/20260910163000_vendor_invoice_cost_projection_atomic.sql');
  assert.match(sql, /cost_source_type='VENDOR_INVOICE'/);
  assert.match(sql, /cost_effective_at<=v_invoice\.invoice_date/);
  assert.match(sql, /update public\.dishes/);
  assert.match(sql, /recipe UOM conversion unresolved/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /grant execute .* to service_role/s);
});

test('cost runtime never guesses an unresolved item or UOM conversion', () => {
  const source = read('lib/inventory/costing/InventoryUomCostRuntime.js');
  assert.match(source, /ITEM_UNRESOLVED/);
  assert.match(source, /UOM_UNRESOLVED/);
  assert.match(source, /CONVERSION_UNRESOLVED/);
  assert.match(source, /sourceFactor\/baseFactor/);
  assert.match(source, /inventory_item_uom_conversions/);
});

test('Supply Chain runtime exposes vendor invoice cost projection capability', () => {
  const source = read('lib/inventory/runtime/InventoryDomainRuntime.js');
  assert.match(source, /purchase_costs/);
  assert.match(source, /apply_vendor_invoice/);
  assert.match(source, /createVendorInvoiceCostProjectionCapability/);
});
