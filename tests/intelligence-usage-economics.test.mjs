import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const source = fs.readFileSync(new URL("../lib/operator/runtime/IntelligenceUsageEconomicsRuntime.js", import.meta.url), "utf8");
test("organization intelligence economics reads canonical service usage ledger", () => {
  assert.match(source, /platform_service_usage/);
  assert.match(source, /organization_id/);
  assert.match(source, /supplier_cost/);
  assert.match(source, /customer_price/);
  assert.match(source, /intelligence_context_budget/);
  assert.doesNotMatch(source, /organization_wallets/);
  assert.doesNotMatch(source, /wallet_transactions/);
});
