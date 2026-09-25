import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const usageRoute = fs.readFileSync("app/api/platform/usage/route.js", "utf8");
const developerRuntime = fs.readFileSync("lib/developer/DeveloperPortalRuntime.js", "utf8");

test("service usage API avoids oversized provider metadata blobs", () => {
  const match = usageRoute.match(/from\("platform_service_usage"\)[\s\S]{0,120}select\("([^"]+)"\)/);
  assert.ok(match);
  assert.doesNotMatch(match[1], /\*|metadata/);
  for (const field of ["quantity","customer_price","supplier_cost","capability","operation","status","created_at"]) assert.match(match[1], new RegExp(field));
});

test("developer usage summary avoids oversized provider metadata blobs", () => {
  const start = developerRuntime.indexOf("export async function developerUsageSummary");
  const chunk = developerRuntime.slice(start, start + 5000);
  const matches = [...chunk.matchAll(/from\("platform_service_usage"\)[\s\S]{0,160}select\("([^"]+)"\)/g)];
  assert.equal(matches.length, 1);
  assert.doesNotMatch(matches[0][1], /\*|metadata/);
  assert.match(matches[0][1], /provider_model/);
  assert.match(matches[0][1], /error_message/);
});
