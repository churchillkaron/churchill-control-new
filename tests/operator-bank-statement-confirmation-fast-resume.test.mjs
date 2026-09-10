import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deterministicFinanceExecutionVerification } from '../lib/operator/runtime/OperatorDeterministicFinanceVerification.js';

test('confirmed bank statement import uses deterministic Finance evidence summary', () => {
  const verification = deterministicFinanceExecutionVerification({
    capability: { key:'finance.bank_statements.create' },
    result: {
      success:true, imported:true, line_count:74,
      reconciliation:{ success:true, matched_count:68, unmatched_count:6 },
      payment_evidence:{ matched_count:70, unmatched_count:4, reconciliation_authority:false },
    },
  });
  assert.ok(verification);
  assert.match(verification.response_text, /74 transaction lines/);
  assert.match(verification.response_text, /matched 68; 6 remain unmatched/);
  assert.match(verification.response_text, /70 lines matched known payment evidence/);
  assert.match(verification.response_text, /not itself accounting reconciliation/);
  assert.equal(verification.provider_evidence.provider, 'avantiqo-local');
  assert.equal(verification.provider_evidence.usage_id, null);
});

test('deterministic verifier does not replace unrelated capability verification', () => {
  assert.equal(deterministicFinanceExecutionVerification({
    capability:{ key:'finance.customer_receipt.post' }, result:{ success:true },
  }), null);
});

test('affirmative pending action executes before general reasoning', () => {
  const core = readFileSync('lib/operator/runtime/OperatorTurnRuntimeCore.js', 'utf8');
  const pendingBranch = core.indexOf('if (pending && (isAffirmative(message) || resumeFromApproval || resumeMission))');
  const pendingExecute = core.indexOf('payload: pending.payload', pendingBranch);
  const generalReasoning = core.indexOf('const reasoning = await reasonAboutOperatorTurn({', pendingBranch);
  assert.ok(pendingBranch >= 0);
  assert.ok(pendingExecute > pendingBranch);
  assert.ok(generalReasoning > pendingExecute);
});

test('bank statement confirmed action bypasses paid generic verification', () => {
  const core = readFileSync('lib/operator/runtime/OperatorTurnRuntimeCore.js', 'utf8');
  const deterministic = core.indexOf('const deterministicVerification = deterministicFinanceExecutionVerification({');
  const branch = core.indexOf('if (deterministicVerification)', deterministic);
  const generic = core.indexOf('await verifyOperatorExecution({', branch);
  assert.ok(deterministic >= 0 && branch > deterministic && generic > branch);
  assert.match(core.slice(branch, generic), /else\s*\{/);
});
