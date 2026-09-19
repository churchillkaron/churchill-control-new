import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const semantic = fs.readFileSync('lib/operator/runtime/OperatorPendingActionSemanticInterpreter.js','utf8');
const synthetic = fs.readFileSync('lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js','utf8');
const live = fs.readFileSync('app/api/operator/turn/live/route.js','utf8');
const preview = fs.readFileSync('app/api/operator/staged-invoice-preview/route.js','utf8');
const front = fs.readFileSync('lib/operator/runtime/OperatorFrontCognitionRuntime.js','utf8');

test('pending discussion can preserve a requested preview without confirming execution', () => {
  assert.match(semantic, /\["cancel", "revise", "new_goal"\]\.includes\(result\.relation\)/);
  assert.doesNotMatch(semantic, /result\.relation !== "confirm"/);
});

test('staged customer invoice preview is a non-mutating fast path', () => {
  assert.match(synthetic, /directPendingPresentation === "preview" \|\| semanticPendingRelation === "discuss"/);
  assert.match(synthetic, /semanticPendingPresentation === "preview"/);
  assert.match(synthetic, /!directPendingPresentation/);
  assert.match(synthetic, /pending_action_preview_fast_path: true/);
  assert.match(synthetic, /mutation_performed: false/);
  assert.match(synthetic, /staged-invoice-preview/);
});

test('staged invoice preview is bound to authenticated server-side conversation state', () => {
  assert.match(preview, /requireOrganizationAccess/);
  assert.match(preview, /\.eq\("organization_id"/);
  assert.match(preview, /\.eq\("party_id"/);
  assert.match(preview, /\.eq\("id", conversationId\)/);
  assert.match(preview, /finance\.accounts_receivable\.CreateCustomerInvoice/);
  assert.match(preview, /Nothing has been created yet/);
});

test('normal live wrapper no longer publishes the misleading generic routing status', () => {
  assert.doesNotMatch(live, /I’m checking the relevant information and working out the next useful step/);
  assert.match(live, /if \(codeInspection\)/);
});

test('front CPU cognition can resolve governed managed credentials and fails fast', () => {
  assert.match(front, /resolveProviderCredential/);
  assert.match(front, /provider: "avantiqo-intelligence"/);
  assert.match(front, /OPERATOR_FRONT_COGNITION_CREDENTIAL_TIMEOUT/);
  assert.match(front, /2500/);
});
