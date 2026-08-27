import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL(
    "../scripts/run-avantiqo-intelligence-cognition-runtime-certification-platform-local.mjs",
    import.meta.url,
  ),
  "utf8",
);

test("cognition certification platform scope is canonical and internal", () => {
  assert.match(source, /AVANTIQO_INTELLIGENCE_COGNITION_PLATFORM_SCOPE_V1/);
  assert.match(source, /CANONICAL_ORGANIZATION_NAME = "Avantiqo Platform"/);
  assert.match(source, /CANONICAL_ORGANIZATION_TYPE = "enterprise_group"/);
  assert.match(source, /\.eq\("status", "active"\)/);
  assert.match(source, /\.eq\("organization_status", "ACTIVE"\)/);
  assert.match(source, /matches\.length !== 1/);
});

test("platform scope resolution is read only and never creates an organization", () => {
  assert.match(source, /\.from\("organizations"\)/);
  assert.match(source, /\.select\("id,name,organization_type,status,organization_status"\)/);
  assert.doesNotMatch(source, /\.insert\(/);
  assert.doesNotMatch(source, /\.upsert\(/);
  assert.doesNotMatch(source, /\.update\(/);
  assert.doesNotMatch(source, /\.delete\(/);
  assert.match(source, /AVANTIQO_COGNITION_PLATFORM_SCOPE_ORGANIZATION_CREATED=false/);
  assert.match(source, /AVANTIQO_COGNITION_PLATFORM_SCOPE_DATABASE_MUTATED=false/);
});

test("resolved organization id is passed only through child environment and never printed", () => {
  assert.match(source, /AVANTIQO_INTELLIGENCE_COGNITION_CERT_ORGANIZATION_ID: organizationId/);
  assert.match(source, /AVANTIQO_COGNITION_PLATFORM_SCOPE_ORGANIZATION_ID_PRINTED=false/);
  assert.doesNotMatch(source, /console\.log\([^\n]*organizationId/);
});
