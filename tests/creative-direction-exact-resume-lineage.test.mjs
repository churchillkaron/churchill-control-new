import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('lib/creative/director/runtime/CreativeDirectionExactResumeRuntime.js','utf8');

test('exact resume identity includes optional creative direction lineage', () => {
  assert.match(source, /creative_direction_lineage_id: metadata\.creative_direction_lineage_id \|\| null/);
  assert.match(source, /const lineageId = text\(project\.metadata\?\.creative_direction_lineage_id\)/);
  assert.match(source, /request_hash: baseRequestHash, creative_direction_lineage_id: lineageId/);
});

test('legacy projects without lineage preserve prior request hash behavior', () => {
  assert.match(source, /const requestHash = lineageId[\s\S]*\? hash\([\s\S]*: baseRequestHash;/);
});
