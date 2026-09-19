import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPaperExecutionRuntime.js", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260919031453_markets_automation_permission_fill_fence.sql", import.meta.url),
  "utf8",
);

test("ordinary automation reruns deterministic sizing under current policy", () => {
  assert.match(runtime, /calculateAutonomousPaperOrder\(\{/);
  assert.match(runtime, /automationPolicy: executionState\.automation \|\| \{\}/);
  assert.match(runtime, /riskPolicy: executionState\.policy \|\| \{\}/);
  assert.match(runtime, /equity,/);
  assert.match(runtime, /position: currentPosition/);
  assert.match(runtime, /marketPrice/);
});

test("fill-time sizing reuses persisted volatility and regime inputs", () => {
  assert.match(
    runtime,
    /candidate_annualized_volatility_pct/,
  );
  assert.match(
    runtime,
    /market_regime_sizing_scale/,
  );
});

test("ordinary automated BUY is cancelled when current policy requires a smaller remainder", () => {
  assert.match(
    runtime,
    /number\(currentAutomationSizing\?\.quantity, 0\) \+ 1e-12 >= remainingQuantity/,
  );
  assert.match(runtime, /AUTOMATION_SIZING_POLICY_CHANGED/);
  assert.match(runtime, /CURRENT_POLICY_REQUIRES_SMALLER_BUY/);
});

test("ordinary automation is cancelled when current policy makes it non-executable", () => {
  assert.match(runtime, /AUTOMATION_SIZING_NO_LONGER_EXECUTABLE/);
  assert.match(runtime, /CURRENT_POLICY_NOT_EXECUTABLE/);
  assert.match(runtime, /risk_status: "CANCELLED"/);
});

test("successful fill evidence persists current-policy automation sizing", () => {
  assert.match(
    runtime,
    /automation_sizing_revalidation: automationSizingRevalidation/,
  );
  assert.match(runtime, /automationSizingRevalidation\.approved &&/);
});

test("database requires successful automation sizing evidence", () => {
  assert.match(
    migration,
    /risk_revalidation,automation_sizing_revalidation,approved/,
  );
  assert.match(migration, /PAPER_AUTOMATION_SIZING_REVALIDATION_REQUIRED/);
});

test("database independently enforces current automation and risk confidence floors", () => {
  assert.match(
    migration,
    /coalesce\(v_decision\.confidence, 0\) < greatest\(/,
  );
  assert.match(migration, /v_automation_policy\.min_confidence/);
  assert.match(migration, /v_risk_policy\.min_decision_confidence/);
  assert.match(migration, /PAPER_AUTOMATION_CONFIDENCE_BELOW_CURRENT_FLOOR/);
});

test("automation sizing database fence precedes fill mutation", () => {
  const fenceIndex = migration.indexOf("PAPER_AUTOMATION_SIZING_REVALIDATION_REQUIRED");
  const fillIndex = migration.indexOf("v_result := public.market_apply_paper_fill(");
  assert.ok(fenceIndex >= 0 && fenceIndex < fillIndex);
});
