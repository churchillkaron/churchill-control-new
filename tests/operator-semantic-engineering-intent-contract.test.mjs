import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = fs.readFileSync('lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js', 'utf8');

test('semantic understanding carries product engineering intent', () => {
  assert.match(source, /execution_domain/);
  assert.match(source, /product_engineering/);
  assert.match(source, /engineering_scope/);
  assert.match(source, /engineering_mode/);
});

test('engineering intent remains descriptive rather than authority', () => {
  assert.match(source, /This classification grants no authority/);
  assert.match(source, /Governance is enforced later/);
  assert.match(source, /allow_mutating_tools: false/);
});
