import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../lib/platform/service-runtime/execution/ServiceExecutionRuntime.js', import.meta.url), 'utf8');

test('settlement may top up only within the already-authorized maximum', () => {
  assert.match(source, /maximumChargeAmount === null \|\| maximumChargeAmount === undefined/);
  assert.match(source, /charge > authorizedMaximum/);
  assert.match(source, /reservationTopUp = topUp/);
  assert.match(source, /WalletRuntime\.reserve\(\{[\s\S]*amount: topUp[\s\S]*reference: `\$\{usageId\}:settlement-top-up`/);
  assert.match(source, /authorized_maximum_amount: authorizedMaximum/);
  assert.match(source, /SERVICE_ACTUAL_PRICE_EXCEEDS_RESERVATION/);
});

test('both immediate and pending settlement receive the persisted cost-guard ceiling', () => {
  const matches = source.match(/maximumChargeAmount: [^\n]*service_cost_guard_maximum_customer_price[^\n]*/g) || [];
  assert.equal(matches.length, 2);
  assert.match(source, /currency: pricing\.currency/);
  assert.match(source, /currency: reservationPricing\.currency \|\| usage\.currency \|\| null/);
});
