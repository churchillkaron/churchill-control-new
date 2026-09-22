import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const solutionsModule = await import(pathToFileURL(path.resolve("lib/platform/solutions/OrganizationOperationalSolutionRegistry.js")));
const profilesModule = await import(pathToFileURL(path.resolve("lib/operations/presentation/OperationsIndustryProfiles.js")));
const definitions = solutionsModule.SOLUTION_DEFINITIONS;
const getProfile = profilesModule.getOperationsIndustryProfile;

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

test("installed operational solution aliases are globally unambiguous", () => {
  const owners = new Map();
  for (const solution of definitions) {
    for (const alias of solution.aliases) {
      const key = normalize(alias);
      const previous = owners.get(key);
      assert.equal(previous, undefined, `alias ${key} belongs to both ${previous} and ${solution.id}`);
      owners.set(key, solution.id);
    }
  }
});

test("every adaptive industry solution has a canonical profile for every alias", () => {
  for (const solution of definitions) {
    const command = solution.items?.[0];
    const match = String(command?.route || "").match(/\/operations\/industry\/([^/?#]+)/);
    if (!match) continue;
    const canonicalSlug = match[1];
    const canonical = getProfile(canonicalSlug);
    assert.ok(canonical, `${solution.id} command route has no profile for ${canonicalSlug}`);
    for (const alias of solution.aliases) {
      const resolved = getProfile(alias);
      assert.ok(resolved, `${solution.id} alias ${alias} has no adaptive profile`);
      assert.equal(resolved.id, canonical.id, `${solution.id} alias ${alias} resolves to ${resolved.id}, expected ${canonical.id}`);
    }
  }
});

test("general fallback always has a registered adaptive profile", () => {
  const resolved = solutionsModule.resolveOrganizationOperationalSolutions({
    organization: { industry: "future-industry-not-yet-known" },
    organizationId: "org-test",
  });
  assert.equal(resolved[0]?.id, "general-operations");
  assert.equal(getProfile("general-operations")?.id, "general-operations");
});
