#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  "lib/intelligence/runtime/AvantiqoProductRepositoryAssessmentRuntime.js",
  "utf8",
);

for (const fragment of [
  "MAX_DYNAMIC_EVIDENCE_FILES = 8",
  "MAX_PLANNED_EVIDENCE_SEARCHES = 6",
  "PLANNED_EVIDENCE_ALLOWED_PATHS",
  '"lib/intelligence"',
  '"lib/operator"',
  '"lib/platform"',
  '"lib/code"',
  "EVIDENCE_SEARCHES",
  "evidencePlanningSystem",
  "normalizedPlannedEvidenceQueries",
  "planRepositoryEvidenceQueries",
  'contract: "AVANTIQO_PRODUCT_REPOSITORY_EVIDENCE_QUERY_PLAN_V1"',
  'planner: "AVANTIQO_OWNED_INTELLIGENCE"',
  "fallback_deterministic_searches_preserved: true",
  "repository_evidence_query_planner_attempted: true",
  "intelligence_planned_repository_evidence",
  '"owned_intelligence_planner"',
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
  source.includes("if (normalized.length >= MAX_PLANNED_EVIDENCE_SEARCHES) break;"),
  "Owned intelligence evidence planning must stay bounded to the configured query limit",
);
for (const allowedPath of [
  "lib/intelligence",
  "lib/operator",
  "lib/platform",
  "lib/code",
]) {
  assert.ok(
    source.includes(`"${allowedPath}"`),
    `Owned intelligence evidence planner must retain approved source path ${allowedPath}`,
  );
}
assert.ok(
  source.includes(".filter((path) => allowedPaths.has(path))"),
  "Owned intelligence evidence planner output must be filtered to approved source paths",
);
assert.ok(
  source.includes("deterministicQueries.has(query.toLowerCase())"),
  "Owned intelligence evidence planner must not waste its bounded budget duplicating deterministic searches",
);
assert.ok(
  source.includes('authorization: { allow_mutating_tools: false }'),
  "Repository assessment intelligence must remain read-only",
);
assert.ok(
  source.includes("tools: []"),
  "Owned intelligence evidence planning must not gain tool execution authority",
);
assert.ok(
  source.includes('mode: "fast"'),
  "Evidence query planning must use the bounded fast supervisor path",
);
assert.ok(
  source.includes("max_output_tokens: 900"),
  "Evidence query planning must retain a bounded output budget",
);
assert.ok(
  source.includes('status: "FALLBACK_DETERMINISTIC"'),
  "Planner failure must fall back to deterministic repository evidence instead of blocking assessment",
);
assert.ok(
  source.includes("const searches = [...deterministicSearches, ...plannedSearches];"),
  "Planned searches must supplement rather than replace deterministic repository evidence",
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

const plannerStart = source.indexOf("async function planRepositoryEvidenceQueries");
const parserStart = source.indexOf("function parsedSearchMatch", plannerStart);
assert.ok(plannerStart >= 0 && parserStart > plannerStart);
const plannerSource = source.slice(plannerStart, parserStart);
assert.ok(plannerSource.includes("AvantiqoStructuredIntelligenceSupervisorRuntime.run"));
assert.ok(plannerSource.includes("tools: []"));
assert.ok(plannerSource.includes('authorization: { allow_mutating_tools: false }'));
assert.ok(plannerSource.includes('query_plan_only: true'));
assert.ok(plannerSource.includes('status: "FALLBACK_DETERMINISTIC"'));
assert.ok(plannerSource.includes('read_only: true'));
assert.ok(plannerSource.includes('authorization_effect: "NONE"'));

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
console.log("OPERATOR_PRODUCT_REPOSITORY_EVIDENCE_PLANNER=AVANTIQO_OWNED_INTELLIGENCE");
console.log("OPERATOR_PRODUCT_REPOSITORY_EVIDENCE_PLANNER_LIMIT=6_LITERAL_QUERIES");
console.log("OPERATOR_PRODUCT_REPOSITORY_EVIDENCE_PLANNER_SCOPE=APPROVED_LIB_SUBTREES_ONLY");
console.log("OPERATOR_PRODUCT_REPOSITORY_EVIDENCE_PLANNER_TOOLS=NONE");
console.log("OPERATOR_PRODUCT_REPOSITORY_EVIDENCE_PLANNER_FAILURE=DETERMINISTIC_FALLBACK");
console.log("OPERATOR_PRODUCT_REPOSITORY_DYNAMIC_EVIDENCE_CERTIFICATION=BOUNDED_NOT_FULL_REPOSITORY");
