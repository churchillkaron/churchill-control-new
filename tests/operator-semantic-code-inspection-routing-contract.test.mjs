import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const turn = fs.readFileSync('lib/operator/runtime/OperatorTurnRuntime.js', 'utf8');
const understanding = fs.readFileSync('lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js', 'utf8');

test('semantic product engineering inspection reaches dedicated read-only Code inspector', () => {
  assert.match(turn, /runOperatorReadOnlyCodeInspectionTurn/);
  assert.match(turn, /execution_domain/);
  assert.match(turn, /product_engineering/);
  assert.match(turn, /engineering_mode/);
  assert.match(turn, /inspect/);
  assert.match(turn, /requires_mutation !== true/);
});

test('semantic inspection is governed but never converted into mutation authority', () => {
  assert.match(understanding, /productEngineeringInspection/);
  assert.match(understanding, /route: productEngineeringInspection \? "governed" : route/);
  assert.match(understanding, /requires_mutation: productEngineeringInspection \? false/);
  assert.match(understanding, /needs_current_evidence: productEngineeringInspection \? true/);
});
