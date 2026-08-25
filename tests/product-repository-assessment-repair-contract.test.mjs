import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL(
    "../lib/platform/capabilities/createProductRepositoryAssessmentCapability.js",
    import.meta.url,
  ),
  "utf8",
);

test("Product repository assessment retries only the invalid evidence-backed objective once", () => {
  assert.match(
    source,
    /PRODUCT_REPOSITORY_ASSESSMENT_EVIDENCE_BACKED_OBJECTIVE_REQUIRED/,
  );
  assert.match(source, /MAX_OBJECTIVE_REPAIR_ATTEMPTS\s*=\s*1/);
  assert.match(
    source,
    /if \(reason !== OBJECTIVE_REQUIRED_ERROR\) throw error/,
  );
  assert.match(
    source,
    /const repaired = await assessAvantiqoCurrentRepository\(\{/,
  );
});

test("Product repository assessment repair remains exact-path, bounded and read-only", () => {
  assert.match(
    source,
    /evidence_paths value copied exactly from a successfully read repository_snapshot\.evidence_files\[\]\.file_path or repository_snapshot\.dynamic_evidence_expansion\.files\[\]\.file_path/,
  );
  assert.match(source, /one to six concrete evidence-verifiable completion_criteria/);
  assert.match(source, /read_only:\s*true/);
  assert.match(source, /authorization_effect:\s*"NONE"/);
  assert.match(
    source,
    /do not authorize commit, deploy, migration, publication, secret access, destructive action, or recursive execution/,
  );
});

test("Product repository assessment exposes repair evidence without weakening the assessor gate", () => {
  assert.match(
    source,
    /AVANTIQO_PRODUCT_REPOSITORY_ASSESSMENT_OBJECTIVE_REPAIR_V1/,
  );
  assert.match(source, /objective_candidate_repair/);
  assert.match(source, /fresh_main_reassessment:\s*attempted/);
  assert.doesNotMatch(source, /catch\s*\([^)]*\)\s*\{\s*return\s+\{/s);
});
