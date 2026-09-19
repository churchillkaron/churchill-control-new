import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("app/api/workspace/finance/practice-engagements/route.js", "utf8");
const component = fs.readFileSync("components/workspace/finance/FinancePracticeClientSetup.jsx", "utf8");
const tower = fs.readFileSync("components/workspace/finance/FinancePracticeControlTower.jsx", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260918182000_accounting_client_engagement_creation.sql", "utf8");

test("practice client creation re-authorizes firm and client scopes", () => {
  assert.match(route, /requireOrganizationAccess\(\{[\s\S]*organizationId: accountingFirmId/);
  assert.match(route, /requireOrganizationAccess\(\{[\s\S]*organizationId: clientOrganizationId/);
  assert.match(route, /finance\.accounting\.manage/);
  assert.match(route, /finance\.configuration\.manage/);
  assert.match(route, /\.eq\("organization_id", clientAccess\.organizationId\)/);
  assert.match(route, /\.eq\("is_active", true\)/);
});

test("practice client creation uses one atomic database mutation", () => {
  assert.match(route, /\.rpc\(\s*"accounting_create_client_engagement_atomic"/);
  assert.match(migration, /create or replace function public\.accounting_create_client_engagement_atomic/);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /accounting_client_profiles_firm_client_uidx/);
  assert.match(migration, /accounting_engagements_one_active_firm_client_uidx/);
  assert.match(migration, /on conflict \(accounting_firm_id, organization_id\)/);
  assert.match(migration, /'ALREADY_EXISTS'/);
  assert.match(migration, /grant execute[\s\S]*to service_role/i);
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/i);
});

test("Finance client UI selects existing Platform organizations rather than creating arbitrary organizations", () => {
  assert.match(component, /fetch\("\/api\/workspace\/list"/);
  assert.match(component, /fetch\("\/api\/workspace\/finance\/practice-engagements"/);
  assert.match(component, /\/api\/finance\/legal-entities\/list/);
  assert.match(component, /does not create a new Platform organization/i);
  assert.match(tower, /FinancePracticeClientSetup/);
  assert.match(tower, /existingClients=\{clients\}/);
});

test("client setup exposes required engagement scope and onboarding handoff", () => {
  for (const field of [
    "servicePackage", "monthlyFee", "billingDay", "accountingStandard",
    "bookkeepingEnabled", "vatEnabled", "payrollEnabled", "taxEnabled",
    "reportingEnabled", "auditEnabled", "contactName", "contactEmail",
    "taxId", "vatNumber",
  ]) assert.match(component, new RegExp(field));
  assert.match(component, /Continue in Onboarding/i);
});
