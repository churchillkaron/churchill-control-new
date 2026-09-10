import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const registry = readFileSync('lib/platform/registry/erpRegistry.base.js', 'utf8');
const bridge = readFileSync('lib/platform/registry/operatorRegistryBridge.js', 'utf8');
const route = readFileSync('app/api/finance/bank-statements/import/route.js', 'utf8');
const financeRuntime = readFileSync('lib/finance/FinanceRuntime.js', 'utf8');
const capability = readFileSync('lib/finance/bank-statements/capabilities/importBankStatement.js', 'utf8');

test('bank statement import is a governed Operator create capability', () => {
  assert.match(registry, /id: "bank_statements"[\s\S]{0,600}status: "active"/);
  assert.match(registry, /id:"bank_statement_import"[\s\S]{0,250}api:"\/api\/finance\/bank-statements\/import"/);
  assert.match(bridge, /operatorRequiresConfirmation:\s*true/);
  assert.match(bridge, /operatorAutoExecute:\s*false/);
  assert.match(route, /requireFinanceWorkspacePermission/);
  assert.match(route, /capabilityId:\s*"bank_statements"/);
  assert.match(route, /create_finance_bank_statement_import/);
  assert.match(financeRuntime, /bank_statements:[\s\S]{0,200}importBankStatement/);
  assert.match(capability, /const REQUIRED_PERMISSION = \"finance\.banking\.manage\"/);
  assert.match(capability, /operatorRequiresConfirmation:\s*true/);
  assert.match(capability, /operatorAutoExecute:\s*false/);
  assert.match(capability, /const ENDPOINT = \"\/api\/finance\/bank-statements\/import\"/);
});
