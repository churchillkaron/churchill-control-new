import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getOperationalSolutionDefinitions } from "../lib/platform/solutions/OrganizationOperationalSolutionRegistry.js";
import { getOperationsIndustryProfile, OPERATIONS_INDUSTRY_PROFILES } from "../lib/operations/presentation/OperationsIndustryProfiles.js";

const dynamicIndustryPage = fs.readFileSync("app/(system)/workspace/[organizationId]/operations/industry/[industryId]/page.jsx", "utf8");
const workspaceRoot = "app/(system)/workspace/[organizationId]";
const specializedAliases = new Set([
  "restaurant", "bar", "pub", "cafe", "coffee-shop", "food-service", "food-and-beverage", "f-and-b",
  "hotel", "resort", "accommodation", "lodging", "guest-house", "guesthouse",
  "pest-control", "pestcontrol", "pest-management",
]);

function hasSpecializedAlias(alias) {
  const escaped = alias.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  return new RegExp(`(?:^|\\n)\\s*(?:${escaped}|[\"']${escaped}[\"'])\\s*:`).test(dynamicIndustryPage);
}

function collectPages(dir, target = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) collectPages(file, target);
    else if (/^page\.(jsx|js|tsx|ts)$/.test(entry.name)) target.push(file);
  }
  return target;
}

function routePattern(file) {
  let rel = file.slice(workspaceRoot.length).replace(/\\/g, "/").replace(/\/page\.(jsx|js|tsx|ts)$/, "");
  if (!rel) rel = "/";
  let escaped = rel.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  escaped = escaped.replace(/\\\[\\\.\\\.\\\.(\w+)\\\]/g, ".*").replace(/\\\[(\w+)\\\]/g, "[^/]+");
  return new RegExp(`^${escaped}/?$`);
}

const pagePatterns = collectPages(workspaceRoot).map(routePattern);
function routeExists(route) {
  const clean = String(route || "").split("?")[0].replace(/^\/workspace\/:organizationId/, "") || "/";
  return pagePatterns.some((pattern) => pattern.test(clean));
}

test("every registered operational industry alias resolves", () => {
  let count = 0;
  for (const solution of getOperationalSolutionDefinitions()) {
    for (const alias of solution.aliases || []) {
      count += 1;
      const resolved = getOperationsIndustryProfile(alias);
      const specialized = specializedAliases.has(alias) && hasSpecializedAlias(alias);
      assert.equal(Boolean(resolved || specialized), true, `unresolved alias: ${solution.id}:${alias}`);
    }
  }
  assert.ok(count >= 200, `expected broad alias coverage, got ${count}`);
});

test("all industry profile links resolve to real workspace pages", () => {
  for (const [profileKey, profile] of Object.entries(OPERATIONS_INDUSTRY_PROFILES)) {
    for (const group of ["primaryActions", "stages", "tools"]) {
      for (const item of profile[group] || []) {
        if (!item.route) continue;
        assert.equal(routeExists(item.route), true, `${profileKey}.${group}.${item.id || item.label}: ${item.route}`);
      }
    }
  }
});

test("all solution-card links resolve to real workspace pages", () => {
  for (const solution of getOperationalSolutionDefinitions()) {
    for (const item of solution.items || []) {
      assert.equal(routeExists(item.route), true, `${solution.id}.${item.id}: ${item.route}`);
    }
  }
});
