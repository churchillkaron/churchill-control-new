import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const policy = fs.readFileSync(new URL("../lib/service-management/api/ServiceManagementAccessPolicy.js", import.meta.url), "utf8");
const resolver = fs.readFileSync(new URL("../lib/service-management/api/resolveServiceManagementContext.js", import.meta.url), "utf8");

test("field-service shared resolver applies live effective organization permissions", () => {
  assert.match(resolver, /requireOrganizationAccess/);
  assert.match(resolver, /resolveStaffPortalEffectivePermissions/);
  assert.match(resolver, /assertServiceManagementAccess/);
  assert.match(resolver, /effective\.permissions/);
});

test("technician execution and management/setup authority remain separate", () => {
  assert.match(policy, /TECHNICIAN_ROLES/);
  assert.match(policy, /canExecuteServiceWork/);
  assert.match(policy, /canManageServiceWork/);
  assert.match(policy, /Field service management access denied/);
  assert.match(policy, /Field service operational access denied/);
});

test("plans, execution templates, assignment and treatment catalog are management surfaces", () => {
  assert.match(policy, /\/api\/service-management\/execution-templates/);
  assert.match(policy, /\/api\/service-management\/plans/);
  assert.match(policy, /\/api\/service-management\/assignment-candidates/);
  assert.match(policy, /\/api\/service-management\/treatment-catalog/);
});
