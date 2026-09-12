import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const resolver = fs.readFileSync(
  "lib/platform/service-runtime/services/resolver/OrganizationServiceResolver.js",
  "utf8",
);

test("single-service resolution honors the same platform AI entitlement as service listing", () => {
  assert.match(resolver, /function platformAiEntitlement\(serviceId, organizationService = null\)/);
  assert.match(resolver, /return platformAiEntitlement\(service_id, organizationService\) \|\| organizationService;/);
  assert.match(resolver, /status: "ACTIVE"/);
  assert.match(resolver, /usage_enabled: true/);
  assert.match(resolver, /billing_enabled: true/);
  assert.match(resolver, /entitlement: "PLATFORM_STANDARD"/);
});

test("platform AI entitlement preserves a real organization service id when present", () => {
  assert.match(resolver, /id: organizationService\?\.id \|\| null/);
  assert.match(resolver, /\.\.\.\(organizationService \|\| \{\}\)/);
});
