import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const resolver = fs.readFileSync("lib/platform/service-runtime/services/resolver/ServiceDomainResolver.js", "utf8");
const repository = fs.readFileSync("lib/platform/service-runtime/usage/repositories/ServiceUsageRepository.js", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260922170000_platform_service_usage_domain_totals.sql", "utf8");

test("service domain UI aggregates usage in Postgres instead of loading complete usage history", () => {
  assert.match(resolver, /summarizeByOrganization/);
  assert.doesNotMatch(resolver, /listByOrganization/);
  assert.match(repository, /get_platform_service_usage_totals/);
  assert.match(migration, /group by usage\.capability/);
  assert.match(migration, /idx_platform_service_usage_org_capability/);
  assert.match(migration, /grant execute on function public\.get_platform_service_usage_totals\(uuid\) to service_role/);
});
