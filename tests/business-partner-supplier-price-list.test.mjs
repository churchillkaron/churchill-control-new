import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  hasPreparedAttachmentReflexCandidate,
  resolvePreparedAttachmentReflex,
} from '../lib/operator/runtime/OperatorPreparedAttachmentReflex.js';

const capability = { key:'supply-chain.supplier_prices.import', mode:'write', requires_confirmation:true, auto_execute:false };

function readyPriceList() {
  return {
    name:'supplier-prices.xlsx', sha256:'price-sha',
    prepared_candidate:{ type:'supplier_price', recognized:true, status:'READY_FOR_REVIEW',
      row_count:3,new_count:1,changed_count:1,unchanged_count:1,invalid_count:0,
      import_payload:{ supplier_party_id:'supplier-1', source_attachment_sha256:'price-sha', rows:[
        { item_id:'item-1', price:120, minimum_order_quantity:1 },
        { item_id:'item-2', price:85, minimum_order_quantity:6 },
      ] }, authorization_effect:'NONE' },
  };
}

test('reviewed supplier price list stages governed bulk import', () => {
  const attachments=[readyPriceList()];
  assert.equal(hasPreparedAttachmentReflexCandidate(attachments,'Import these supplier prices'),true);
  const result=resolvePreparedAttachmentReflex({ message:'Import these supplier prices', attachments, capabilities:[capability] });
  assert.equal(result.intent,'execute');
  assert.equal(result.execution.capability_key,'supply-chain.supplier_prices.import');
  assert.equal(result.execution.payload.rows.length,2);
  assert.match(result.response_text,/1 new, 1 changed, and 1 unchanged/i);
});
test('invalid or unmatched price rows never stage a write', () => {
  const file=readyPriceList();
  file.prepared_candidate.status='CLARIFICATION_REQUIRED';
  file.prepared_candidate.clarification_question='Some rows are missing an exact item code.';
  file.prepared_candidate.import_payload=null;
  const result=resolvePreparedAttachmentReflex({ message:'Import these prices', attachments:[file], capabilities:[capability] });
  assert.equal(result.intent,'clarify');
  assert.equal(result.execution.capability_key,null);
});

test('supplier price capability is confirmation gated and procurement scoped', () => {
  const source=readFileSync('lib/inventory/procurement/suppliers/SupplierPriceOperatorCapability.js','utf8');
  assert.match(source,/procurement\.manage/);
  assert.match(source,/operatorRequiresConfirmation:true|operatorRequiresConfirmation:\s*true/);
  assert.match(source,/procurement_import_supplier_prices_atomic/);
});

test('supplier price preparation uses exact active item codes and reports current state', () => {
  const source=readFileSync('lib/inventory/procurement/suppliers/SupplierPriceAttachmentPreparationRuntime.js','utf8');
  assert.match(source,/\.in\("code",codes\)/);
  assert.match(source,/NEW/);
  assert.match(source,/CHANGED/);
  assert.match(source,/UNCHANGED/);
  assert.match(source,/INVALID/);
  assert.doesNotMatch(source,/ilike/i);
});

test('atomic supplier price migration enforces one current price per supplier item', () => {
  const sql=readFileSync('supabase/migrations/20260910154500_supplier_price_atomic_import.sql','utf8');
  assert.match(sql,/ux_supplier_prices_current/);
  assert.match(sql,/procurement_import_supplier_prices_atomic/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/update public\.supplier_prices/);
  assert.match(sql,/insert into public\.supplier_prices/);
  assert.match(sql,/revoke all .* authenticated/s);
});

test('direct supplier price write API requires procurement.manage', () => {
  const api=readFileSync('app/api/procurement/suppliers/route.js','utf8');
  assert.match(api,/permissionKey: "procurement\.manage"/);
  assert.match(api,/request: req/);
});