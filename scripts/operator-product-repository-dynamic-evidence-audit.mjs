#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  "lib/intelligence/runtime/AvantiqoProductRepositoryAssessmentRuntime.js",
  "utf8",
);

for (const fragment of [
  "MAX_DYNAMIC_EVIDENCE_FILES = 8",
  "EVIDENCE_SEARCHES",
  "parsedSearchMatch",
  "dynamicEvidenceCandidates",
  "readDynamicEvidenceFile",
  "expandDynamicEvidence",
  'method: "CURRENT_MAIN_SEARCH_DISCOVERED_IMPLEMENTATION_READS"',
  "dynamic_evidence_expansion: dynamicEvidenceExpansion",
  "dynamic_repository_evidence: true",
  "repository_evidence_expanded: true",
  'authorization_effect: "NONE"',
  "full_repository_certification: false",
]) {
  assert.ok(source.includes(fragment), `dynamic repository evidence missing ${fragment}`);
}

assert.ok(
  source.includes('if (!filePath.startsWith("lib/")) return null;'),
  "Dynamic repository evidence must remain scoped to implementation files",
);
assert.ok(
  source.includes(".slice(0, MAX_DYNAMIC_EVIDENCE_FILES)"),
  "Dynamic repository evidence must stay bounded",
);
assert.ok(
  source.includes('authorization: { allow_mutating_tools: false }'),
  "Repository assessment intelligence must remain read-only",
);
assert.ok(
  source.includes("await workspace.stop()"),
  "Repository assessment must always stop its sandbox",
);
assert.ok(
  !source.includes("workspace.applyFiles("),
  "Repository assessment must never edit source while assessing",
);
assert.ok(
  !source.includes("workspace.run("),
  "Repository assessment must never run mutating repository commands while assessing",
);

const expansionStart = source.indexOf("async function expandDynamicEvidence");
const assessmentStart = source.indexOf("function assessmentSystem", expansionStart);
assert.ok(expansionStart >= 0 && assessmentStart > expansionStart);
const expansionSource = source.slice(expansionStart, assessmentStart);
assert.ok(expansionSource.includes("readDynamicEvidenceFile"));
assert.ok(expansionSource.includes("bounded: true"));
assert.ok(expansionSource.includes("read_only: true"));
assert.ok(expansionSource.includes('authorization_effect: "NONE"'));

console.log("OPERATOR_PRODUCT_REPOSITORY_DYNAMIC_EVIDENCE_AUDIT=PASS");
console.log("OPERATOR_PRODUCT_REPOSITORY_DYNAMIC_EVIDENCE=SEARCH_DISCOVERED_IMPLEMENTATION_READS");
console.log("OPERATOR_PRODUCT_REPOSITORY_DYNAMIC_EVIDENCE_LIMIT=8_FILES");
console.log("OPERATOR_PRODUCT_REPOSITORY_DYNAMIC_EVIDENCE_SCOPE=LIB_IMPLEMENTATION_ONLY");
console.log("OPERATOR_PRODUCT_REPOSITORY_DYNAMIC_EVIDENCE_AUTHORITY=READ_ONLY_NONE");
console.log("OPERATOR_PRODUCT_REPOSITORY_DYNAMIC_EVIDENCE_CERTIFICATION=BOUNDED_NOT_FULL_REPOSITORY");
