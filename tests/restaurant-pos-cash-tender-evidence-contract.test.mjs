import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const checkoutPath = "app/(system)/workspace/[organizationId]/operations/pos/POSInlineCheckout.jsx";
const settlementPath = "lib/restaurant/payments/runtime/settleTablePayment.js";
const migrationPath = "supabase/migrations/20260906184200_restaurant_cash_tender_evidence.sql";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("cash received flows from stationary checkout into settlement authority", async () => {
  const checkout = await source(checkoutPath);
  const settlement = await source(settlementPath);

  assert.match(checkout, /tenderedAmount/);
  assert.match(checkout, /Cash received/);
  assert.match(checkout, /Change/);
  assert.match(settlement, /readValue\(body, "tenderedAmount", "tendered_amount"\)/);
  assert.match(settlement, /p_tendered_amount:\s*tenderedAmount/);
  assert.match(settlement, /Cash received cannot be less than the payment amount/);
});

test("cash tender evidence is persisted without changing sale amount", async () => {
  const migration = await source(migrationPath);

  assert.match(migration, /p_tendered_amount numeric/);
  assert.match(migration, /v_change := round\(v_tendered - v_paid, 2\)/);
  assert.match(migration, /tendered_amount = v_tendered/);
  assert.match(migration, /change_amount = v_change/);
  assert.match(migration, /p_amount => v_paid/);
  assert.match(migration, /cash_tender_evidence_recorded/);
});

test("cash tender retry cannot rewrite physical cash evidence", async () => {
  const migration = await source(migrationPath);

  assert.match(migration, /v_duplicate and v_payment\.metadata \? 'cash_tender_evidence_recorded'/);
  assert.match(migration, /Idempotency key is already used with different cash tender evidence/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /grant execute on function public\.restaurant_settle_table_atomic[\s\S]*to service_role/);
});
