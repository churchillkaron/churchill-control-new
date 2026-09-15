import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('wallet runtime exposes refund only as a governed wallet operation',()=>{
 const s=fs.readFileSync('lib/platform/service-runtime/wallet/runtime/WalletRuntime.js','utf8');
 assert.match(s,/const operation = WALLET_TRANSACTION_TYPES\.REFUND/);
 assert.match(s,/governed_usage_refund: true/);
 assert.match(s,/\n  refund,\n/);
});

test('usage runtime validates charged usage and defect evidence before refund',()=>{
 const s=fs.readFileSync('lib/platform/service-runtime/usage/UsageRuntime.js','utf8');
 assert.match(s,/async refundChargedUsage/);
 assert.match(s,/SERVICE_USAGE_REFUND_ORGANIZATION_MISMATCH/);
 assert.match(s,/SERVICE_USAGE_REFUND_SUCCESS_REQUIRED/);
 assert.match(s,/SERVICE_USAGE_REFUND_DEFECT_EVIDENCE_REQUIRED/);
 assert.match(s,/SERVICE_USAGE_REFUND_EXCEEDS_REMAINING/);
 assert.match(s,/SERVICE_USAGE_GOVERNED_REFUND_V1/);
 assert.match(s,/WalletRuntime\.refund/);
});
