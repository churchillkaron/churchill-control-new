import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const createRoute = fs.readFileSync("app/api/finance/legal-entities/create/route.js", "utf8");
const updateRoute = fs.readFileSync("app/api/finance/legal-entities/update/route.js", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260919011444_legal_entity_default_integrity.sql", "utf8");
const formContract = fs.readFileSync("lib/platform/forms/FinanceFormContract.js", "utf8");
const policy = fs.readFileSync("lib/finance/legal-entities/LegalEntityPolicy.js", "utf8");

test("legal entity create and update share Finance configuration write authority", () => {
  for (const route of [createRoute, updateRoute]) {
    assert.match(route, /requireFinanceWorkspacePermission/);
    assert.match(route, /capabilityId: "legal_entities"/);
    assert.match(route, /operation: "write"/);
  }
  assert.match(createRoute, /permission denied/i);
  assert.match(createRoute, /403/);
});

test("legal entity form exposes every policy-required accounting identity field", () => {
  for (const field of ["legal_name", "code", "country", "currency", "timezone", "locale"]) {
    assert.match(formContract, new RegExp(`name: "${field}"`));
  }
  assert.match(formContract, /name: "is_default_accounting_entity"/);
  assert.match(formContract, /name: "is_active"/);
  assert.match(policy, /Functional Currency must use a three-letter currency code/);
  assert.match(policy, /Timezone must be a valid IANA timezone/);
  assert.match(policy, /Locale must be valid/);
});

test("first active legal entity automatically becomes accounting default", () => {
  assert.match(migration, /normalize_legal_entity_default/);
  assert.match(migration, /coalesce\(new\.is_active, true\) = true/);
  assert.match(migration, /not exists \([\s\S]*from public\.legal_entities le/);
  assert.match(migration, /new\.is_default_accounting_entity := true/);
});

test("promoting a legal entity atomically clears the previous default", () => {
  assert.match(migration, /if new\.is_default_accounting_entity = true then/);
  assert.match(migration, /update public\.legal_entities le/);
  assert.match(migration, /set is_default_accounting_entity = false/);
  assert.match(migration, /le\.organization_id = new\.organization_id/);
});

test("database concurrency fence allows at most one default per organization", () => {
  assert.match(migration, /create unique index if not exists legal_entities_one_default_per_organization/);
  assert.match(migration, /on public\.legal_entities \(organization_id\)/);
  assert.match(migration, /where is_default_accounting_entity = true/);
});

test("default legal entity cannot be inactive and trigger is service-role isolated", () => {
  assert.match(migration, /DEFAULT_ACCOUNTING_ENTITY_MUST_BE_ACTIVE/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /revoke all on function public\.normalize_legal_entity_default\(\)/);
  assert.match(migration, /grant execute on function public\.normalize_legal_entity_default\(\)[\s\S]*to service_role/);
});
