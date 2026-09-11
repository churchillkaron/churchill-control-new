import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runner = fs.readFileSync("scripts/certify-business-partner-finance-database-local.mjs", "utf8");
const wrapper = fs.readFileSync("scripts/run-business-partner-finance-database-certification-local.sh", "utf8");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

test("database certification is hard-blocked outside local Supabase", () => {
  assert.match(runner, /REFUSED_NON_LOCAL_SUPABASE/);
  assert.match(runner, /127\.0\.0\.1/);
  assert.match(runner, /localhost/);
  assert.doesNotMatch(wrapper, /\.env\.local/);
});

test("database certification uses real Finance application services", () => {
  assert.match(runner, /createCustomerInvoiceCommand/);
  assert.match(runner, /postCustomerReceipt\.js/);
  assert.match(runner, /receiptModule\.execute/);
  assert.match(runner, /status\)\.toUpperCase\(\), "PAID"/);
  assert.match(runner, /mode=receipt/);
});

test("fixture identity is unique and cleanup is bounded to created records", () => {
  assert.match(runner, /const runId = randomUUID\(\)/);
  assert.match(runner, /certification_run_id: runId/);
  assert.match(runner, /fixture\.invoiceId/);
  assert.match(runner, /fixture\.paymentId/);
  assert.match(runner, /finally \{\s*await cleanup\(\)/);
});
