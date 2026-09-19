import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260918164515_accounting_engagement_entity_integrity.sql", "utf8");
const materializeRoute = fs.readFileSync("app/api/workspace/finance/recurring-materialize/route.js", "utf8");
const onboardingRoute = fs.readFileSync("app/api/workspace/finance/practice-onboarding/route.js", "utf8");
const planner = fs.readFileSync("lib/finance/practice/recurringCyclePlanner.js", "utf8");

test("engagement legal-entity binding becomes immutable once set", () => {
  assert.match(migration, /validate_accounting_engagement_entity_binding/);
  assert.match(migration, /old\.entity_id is not null/);
  assert.match(migration, /new\.entity_id is distinct from old\.entity_id/);
  assert.match(migration, /ENGAGEMENT_ENTITY_IMMUTABLE/);
  assert.match(migration, /accounting_engagement_entity_binding_guard/);
});

test("engagement entity must be active and belong to the exact client organization", () => {
  assert.match(migration, /from public\.legal_entities le/);
  assert.match(migration, /le\.id = new\.entity_id/);
  assert.match(migration, /le\.organization_id = new\.organization_id/);
  assert.match(migration, /coalesce\(le\.is_active, true\) = true/);
  assert.match(migration, /ENGAGEMENT_ENTITY_SCOPE_MISMATCH/);
});

test("run scope is bound to exact active engagement and its exact legal entity", () => {
  assert.match(migration, /validate_accounting_engagement_run_scope/);
  assert.match(migration, /id = new\.engagement_id/);
  assert.match(migration, /accounting_firm_id = new\.accounting_firm_id/);
  assert.match(migration, /organization_id = new\.organization_id/);
  assert.match(migration, /status = 'ACTIVE'/);
  assert.match(migration, /ENGAGEMENT_ENTITY_REQUIRED/);
  assert.match(migration, /new\.entity_id is distinct from v_engagement\.entity_id/);
  assert.match(migration, /RUN_ENTITY_ENGAGEMENT_MISMATCH/);
});

test("run period must belong to exact client organization and run entity", () => {
  assert.match(migration, /from public\.accounting_periods p/);
  assert.match(migration, /p\.id = new\.period_id/);
  assert.match(migration, /p\.organization_id = new\.organization_id/);
  assert.match(migration, /p\.entity_id = new\.entity_id/);
  assert.match(migration, /RUN_PERIOD_SCOPE_MISMATCH/);
});

test("planner already derives candidates from engagement entity and canonical period", () => {
  assert.match(planner, /entity_id: engagement\.entity_id/);
  assert.match(planner, /resolvePeriod\(periods, engagement\.entity_id/);
  assert.match(planner, /period_id: period\?\.id/);
});

test("materialization and onboarding expose entity-scope defects as conflicts", () => {
  assert.match(materializeRoute, /ENTITY_ENGAGEMENT_MISMATCH/);
  assert.match(materializeRoute, /ENTITY_INACTIVE_OR_OUT_OF_SCOPE/);
  assert.match(materializeRoute, /ENGAGEMENT_SCOPE_MISMATCH/);
  assert.match(materializeRoute, /409/);
  assert.match(onboardingRoute, /ENGAGEMENT_ENTITY_IMMUTABLE/);
  assert.match(onboardingRoute, /ENGAGEMENT_ENTITY_SCOPE_MISMATCH/);
  assert.match(onboardingRoute, /409/);
});

test("entity-integrity trigger functions are invoker-safe and service-role isolated", () => {
  assert.match(migration, /security invoker/gi);
  assert.match(migration, /revoke all on function public\.validate_accounting_engagement_entity_binding\(\)/);
  assert.match(migration, /grant execute on function public\.validate_accounting_engagement_entity_binding\(\)[\s\S]*to service_role/);
  assert.match(migration, /revoke all on function public\.validate_accounting_engagement_run_scope\(\)/);
  assert.match(migration, /grant execute on function public\.validate_accounting_engagement_run_scope\(\)[\s\S]*to service_role/);
});
