import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { routeAnalyzedAttachment } from '../lib/platform/runtime/UniversalAttachmentRoutingRuntime.js';
import {
  hasPreparedAttachmentReflexCandidate,
  resolvePreparedAttachmentReflex,
} from '../lib/operator/runtime/OperatorPreparedAttachmentReflex.js';

const registry = {
  domains: [{ id: 'supply-chain', name: 'Supply Chain', route: '/supply-chain' }],
  workspaces: {
    'supply-chain': { title: 'Supply Chain', groups: [
      { id: 'procurement', name: 'Procurement', items: [{ id: 'purchase_orders', name: 'Purchase Orders', route: '/procurement/purchase-orders' }] },
      { id: 'receiving', name: 'Receiving', items: [{ id: 'goods_receipts', name: 'Goods Receipts', route: '/procurement/goods-receipts' }] },
    ] },
  },
};

const capability = { key: 'supply-chain.purchase_orders.create', mode: 'write', requires_confirmation: true, auto_execute: false };

function readyPo() {
  return {
    name: 'PO-EXT-44.pdf', sha256: 'po-sha',
    prepared_candidate: {
      type: 'purchase_order', recognized: true, status: 'READY_FOR_REVIEW',
      purchase_order: { source_reference: 'EXT-44', currency: 'THB', supplier_party_id: 'supplier-1', items: [{ item_name: 'Coffee', qty: 10, unit_price: 200 }] },
      import_payload: { supplier_party_id: 'supplier-1', currency: 'THB', source_reference: 'EXT-44', source_attachment_sha256: 'po-sha', items: [{ item_name: 'Coffee', qty: 10, unit_price: 200 }] },
      authorization_effect: 'NONE',
    },
  };
}
test('purchase order routes to canonical Supply Chain procurement workspace', () => {
  const file = { analysis: { status: 'ANALYZED', evidence: { object_type: 'purchase_order', document_type: 'purchase_order', candidate_domains: ['Supply Chain','Finance'] } } };
  const result = routeAnalyzedAttachment(file, { registry });
  assert.equal(result.status, 'DESTINATION_RESOLVED');
  assert.equal(result.destination.domain_id, 'supply-chain');
  assert.equal(result.destination.item_id, 'purchase_orders');
  assert.equal(result.destination.route, '/procurement/purchase-orders');
});

test('ready purchase order stages atomic Supply Chain capability behind confirmation', () => {
  const attachments = [readyPo()];
  assert.equal(hasPreparedAttachmentReflexCandidate(attachments, 'Import this purchase order'), true);
  const result = resolvePreparedAttachmentReflex({ message: 'Import this purchase order', entityId: 'entity-1', attachments, capabilities: [capability] });
  assert.equal(result.intent, 'execute');
  assert.equal(result.execution.capability_key, 'supply-chain.purchase_orders.create');
  assert.equal(result.execution.payload.source_reference, 'EXT-44');
  assert.doesNotMatch(JSON.stringify(result.execution.payload), /warehouse/i);
  assert.match(result.response_text, /confirmation/i);
});

test('existing purchase order is not recreated and can be filed as linked evidence', () => {
  const file = readyPo();
  file.attachment_set_id = 'set-1'; file.id = 'file-1'; file.logical_object_count = 1;
  file.prepared_candidate = { type: 'purchase_order', recognized: true, status: 'EXISTING_RECORD', existing_record: { record_type: 'purchase_order', record_id: 'po-1', label: 'PO-000044' }, authorization_effect: 'NONE' };
  const doc = { key: 'documents.files.create', mode: 'write', requires_confirmation: true };
  const result = resolvePreparedAttachmentReflex({ message: 'File this purchase order', entityId: 'entity-1', attachments: [file], capabilities: [doc] });
  assert.equal(result.intent, 'execute');
  assert.equal(result.execution.capability_key, 'documents.files.create');
  assert.equal(result.execution.payload.reference_type, 'purchase_order');
  assert.equal(result.execution.payload.reference_id, 'po-1');
});
test('purchase order capability and inventory import require procurement.manage', () => {
  const po = readFileSync('lib/inventory/procurement/purchase-orders/PurchaseOrderOperatorCapability.js', 'utf8');
  const inventory = readFileSync('lib/inventory/runtime/InventoryOperatorCapability.js', 'utf8');
  assert.match(po, /procurement\.manage/);
  assert.match(po, /create_purchase_order_atomic_rpc/);
  assert.match(po, /operatorRequiresConfirmation:\s*true/);
  assert.match(inventory, /permissions:\s*\["procurement\.manage"\]/);
  assert.match(inventory, /requireExecutionPermission\(context, "procurement\.manage"\)/);
});

test('atomic purchase order migration creates header and lines in one RPC and preserves source reference', () => {
  const sql = readFileSync('supabase/migrations/20260910143000_procurement_purchase_order_atomic_create.sql', 'utf8');
  assert.match(sql, /create or replace function public\.create_purchase_order_atomic_rpc/);
  assert.match(sql, /insert into public\.purchase_orders/);
  assert.match(sql, /insert into public\.purchase_order_items/);
  assert.match(sql, /finance_next_document_number/);
  assert.match(sql, /source_reference/);
  assert.match(sql, /source_attachment_sha256/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /grant execute .* to service_role/s);
  assert.match(sql, /revoke all .* from public, anon, authenticated/s);
});

test('purchase order matching requires exact supplier party plus PO reference', () => {
  const source = readFileSync('lib/platform/runtime/UniversalAttachmentBusinessMatchRuntime.js', 'utf8');
  assert.match(source, /matchPurchaseOrder/);
  assert.match(source, /!reference \|\| !entityId \|\| !supplierPartyId/);
  assert.match(source, /supplier_party_id/);
  assert.doesNotMatch(source, /purchase_order.*ilike/is);
});
