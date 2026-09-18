import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPaperExecutionRuntime.js", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260918165133_markets_policy_revision_fence.sql", import.meta.url),
  "utf8",
);

test("risk revalidation seals exact risk and automation policy revisions", () => {
  assert.match(runtime, /risk_policy_revision: executionState\.policy\?\.updated_at/);
  assert.match(runtime, /automation_policy_revision: executionState\.automation\?\.updated_at/);
  assert.match(runtime, /kill_switch: executionState\.automation\?\.kill_switch === true/);
  assert.match(runtime, /circuit_breaker_latched: executionState\.automation\?\.circuit_breaker_latched === true/);
});

test("runtime kill switch blocks PAPER fill before mutation", () => {
  assert.match(runtime, /PAPER_AUTOMATION_KILL_SWITCH_ACTIVE/);
  const killIndex = runtime.indexOf("PAPER_AUTOMATION_KILL_SWITCH_ACTIVE");
  const rpcIndex = runtime.indexOf('rpc("market_apply_paper_fill_with_quality"');
  assert.ok(killIndex >= 0 && killIndex < rpcIndex);
});

test("database locks and verifies exact risk-policy revision", () => {
  assert.match(migration, /PAPER_RISK_POLICY_REVISION_REQUIRED/);
  assert.match(
    migration,
    /from public\.market_risk_policies[\s\S]*?for share/,
  );
  assert.match(migration, /PAPER_RISK_POLICY_REVISION_STALE/);
});

test("database locks and verifies exact automation-policy revision", () => {
  assert.match(migration, /PAPER_AUTOMATION_POLICY_REVISION_REQUIRED/);
  assert.match(
    migration,
    /from public\.market_automation_policies[\s\S]*?for share/,
  );
  assert.match(migration, /PAPER_AUTOMATION_POLICY_REVISION_STALE/);
});

test("database independently enforces kill switch and BUY circuit breaker", () => {
  assert.match(migration, /PAPER_AUTOMATION_KILL_SWITCH_ACTIVE/);
  assert.match(migration, /PAPER_PORTFOLIO_CIRCUIT_BREAKER_LATCHED/);
});

test("policy revision fences execute before quote consumption and fill mutation", () => {
  const riskIndex = migration.indexOf("PAPER_RISK_POLICY_REVISION_STALE");
  const automationIndex = migration.indexOf("PAPER_AUTOMATION_POLICY_REVISION_STALE");
  const quoteIndex = migration.indexOf("PAPER_EXECUTION_QUOTE_ALREADY_CONSUMED");
  const fillIndex = migration.indexOf("v_result := public.market_apply_paper_fill(");
  assert.ok(riskIndex >= 0 && riskIndex < quoteIndex && riskIndex < fillIndex);
  assert.ok(automationIndex >= 0 && automationIndex < quoteIndex && automationIndex < fillIndex);
});
