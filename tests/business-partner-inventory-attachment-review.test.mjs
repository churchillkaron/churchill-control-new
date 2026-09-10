import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  inventoryRowsFromAttachment,
  normalizeInventoryAttachmentRows,
  buildInventoryReview,
} from '../lib/inventory/runtime/InventoryAttachmentNormalizer.js';

function inventorySheet() {
  return {
    sha256:'abc',
    analysis:{
      status:'ANALYZED', candidate_domains:['Supply Chain'],
      evidence:{ object_type:'inventory_spreadsheet', document_type:'inventory_items' },
      content_excerpt: JSON.stringify({ sheets:[{ name:'Items', rows:[
        {row:1,values:['SKU','Name','Cost','Price','Type']},
        {row:2,values:['A-1','Widget',12.5,20,'stock']},
        {row:3,values:['A-2','Thing',8,15,'stock']},
        {row:4,values:['','Missing Code',4,9,'stock']},
      ]}] }), authorization_effect:'NONE',
    },
  };
}

test('inventory workbook rows are normalized to canonical live inventory fields', () => {
  const raw = inventoryRowsFromAttachment(inventorySheet());
  assert.equal(raw.length, 3);
  const rows = normalizeInventoryAttachmentRows(inventorySheet());
  assert.deepEqual(rows[0], { row_number:2, code:'A-1', name:'Widget', type:'stock', cost:12.5, sale_price:20, missing_fields:[] });
  assert.deepEqual(rows[2].missing_fields, ['code']);
});

test('review separates new existing ambiguous and invalid inventory rows', () => {
  const rows = normalizeInventoryAttachmentRows(inventorySheet());
  const reviewed = buildInventoryReview(rows, [
    {id:'item-1',code:'A-1'},
    {id:'item-2a',code:'A-2'},
    {id:'item-2b',code:'A-2'},
  ]);
  assert.equal(reviewed[0].disposition, 'EXISTING');
  assert.equal(reviewed[0].existing_record_id, 'item-1');
  assert.equal(reviewed[1].disposition, 'AMBIGUOUS');
  assert.deepEqual(reviewed[1].existing_record_ids, ['item-2a','item-2b']);
  assert.equal(reviewed[2].disposition, 'INVALID');
});

test('inventory attachment path remains review-only until an atomic bulk importer exists', () => {
  const runtime = readFileSync('lib/inventory/runtime/InventoryAttachmentPreparationRuntime.js','utf8');
  const route = readFileSync('app/api/operator/turn/route.js','utf8');
  const reflex = readFileSync('lib/operator/runtime/OperatorPreparedAttachmentReflex.js','utf8');
  assert.match(runtime, /REVIEW_ONLY_NO_GOVERNED_BULK_IMPORT/);
  assert.match(runtime, /write_capability_available: false/);
  assert.match(runtime, /authorization_effect: "NONE"/);
  assert.doesNotMatch(runtime, /\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
  assert.match(route, /prepareInventoryAttachment/);
  assert.match(reflex, /does not yet have a governed atomic bulk-import capability/);
});

test('stale single-item inventory endpoint is not used by Business Partner intake', () => {
  const route = readFileSync('app/api/operator/turn/route.js','utf8');
  const runtime = readFileSync('lib/inventory/runtime/InventoryAttachmentPreparationRuntime.js','utf8');
  assert.doesNotMatch(route, /\/api\/inventory\/items/);
  assert.doesNotMatch(runtime, /\/api\/inventory\/items/);
});
