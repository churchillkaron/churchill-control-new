import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(
  new URL("../app/api/markets/command-center/route.js", import.meta.url),
  "utf8",
);
const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPaperExecutionRuntime.js", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260919031453_markets_automation_permission_fill_fence.sql", import.meta.url),
  "utf8",
);

test("runtime identifies automation-generated orders from risk snapshot", () => {
  assert.match(runtime, /order\?\.risk_snapshot\?\.automation === true/);
  assert.match(runtime, /const ordinaryAutomationOrder/);
});

test("auto-paper disable cancels automation authority except active breaker liquidation", () => {
  assert.match(runtime, /AUTO_PAPER_DISABLED/);
  assert.match(runtime, /circuitBreakerDecision && executionState\.automation\?\.circuit_breaker_latched === true/);
  assert.match(runtime, /risk_status: "CANCELLED"/);
});

test("ordinary automated BUY and SELL permissions are revalidated at fill time", () => {
  assert.match(runtime, /AUTOMATED_BUYS_DISABLED/);
  assert.match(runtime, /AUTOMATED_SELLS_DISABLED/);
  assert.match(runtime, /executionState\.automation\?\.allow_buys === false/);
  assert.match(runtime, /executionState\.automation\?\.allow_sells === false/);
});

test("protective and breaker exits are excluded from ordinary side permissions", () => {
  assert.match(runtime, /!protectiveDecision &&[\s\S]*?!circuitBreakerDecision/);
});

test("database detects automation-generated order from risk snapshot", () => {
  assert.match(migration, /v_order\.risk_snapshot->>'automation'/);
  assert.match(migration, /v_ordinary_automation/);
});

test("database enforces auto-paper disable with breaker override", () => {
  assert.match(migration, /PAPER_AUTO_PAPER_DISABLED/);
  assert.match(migration, /v_automation_policy\.auto_paper_enabled is not true/);
  assert.match(migration, /v_automation_policy\.circuit_breaker_latched is true/);
});

test("database enforces ordinary automation side permissions", () => {
  assert.match(migration, /PAPER_AUTOMATED_BUYS_DISABLED/);
  assert.match(migration, /PAPER_AUTOMATED_SELLS_DISABLED/);
  assert.match(migration, /v_automation_policy\.allow_buys is false/);
  assert.match(migration, /v_automation_policy\.allow_sells is false/);
});

test("automation permission database fences precede fill mutation", () => {
  const permissionIndex = migration.indexOf("PAPER_AUTOMATED_SELLS_DISABLED");
  const fillIndex = migration.indexOf("v_result := public.market_apply_paper_fill(");
  assert.ok(permissionIndex >= 0 && permissionIndex < fillIndex);
});

test("policy transition helper locks current automation policy", () => {
  assert.match(
    migration,
    /market_cancel_disallowed_automation_authority[\s\S]*?from public\.market_automation_policies[\s\S]*?for update/,
  );
});

test("policy transition cleanup targets automation orders only", () => {
  assert.match(
    migration,
    /coalesce\(paper_order\.risk_snapshot->>'automation', 'false'\) = 'true'/,
  );
  assert.match(migration, /PAPER_AUTOMATION_POLICY_NO_LONGER_PERMITS_ORDER/);
});

test("active breaker liquidation survives auto-paper disable cleanup", () => {
  assert.match(
    migration,
    /DETERMINISTIC_PORTFOLIO_CIRCUIT_BREAKER[\s\S]*?v_policy\.circuit_breaker_latched is true/,
  );
});

test("ordinary side permissions cancel newly disallowed BUY and SELL automation", () => {
  assert.match(migration, /v_policy\.allow_buys is false/);
  assert.match(migration, /v_policy\.allow_sells is false/);
  assert.match(
    migration,
    /not in \([\s\S]*?'DETERMINISTIC_PROTECTIVE_EXIT',[\s\S]*?'DETERMINISTIC_PORTFOLIO_CIRCUIT_BREAKER'/,
  );
});

test("policy transition helper is service-role only", () => {
  assert.match(
    migration,
    /revoke all on function public\.market_cancel_disallowed_automation_authority[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.market_cancel_disallowed_automation_authority[\s\S]*?to service_role/,
  );
});

test("owner automation policy update invokes proactive permission cleanup", () => {
  assert.match(route, /market_cancel_disallowed_automation_authority/);
  assert.match(
    route,
    /automation_permission_cancellation: automationPermissionCancellation \|\| null/,
  );
});
