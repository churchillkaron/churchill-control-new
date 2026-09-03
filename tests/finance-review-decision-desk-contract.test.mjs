import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync("app/(system)/workspace/[organizationId]/finance/review/page.jsx", "utf8");
const workspace = fs.readFileSync("components/workspace/finance/FinanceReviewerWorkspace.jsx", "utf8");
const panel = fs.readFileSync("components/workspace/finance/FinanceReviewerEvidencePanel.jsx", "utf8");
const runtime = fs.readFileSync("lib/finance/practice/FinanceReviewerEvidenceRuntime.js", "utf8");

function occurrences(value, marker) {
  return value.split(marker).length - 1;
}

test("Finance review renders one governed reviewer queue", () => {
  assert.equal(page.includes("FinanceReviewerEvidenceCockpit"), false);
  assert.equal(occurrences(page, "FinanceReviewerWorkspace"), 2);
  assert.match(workspace, /FinanceReviewerEvidencePanel/);
  assert.match(workspace, /<FinanceReviewerEvidencePanel organizationId=\{organizationId\} row=\{selected\} \/>/);
});

test("embedded evidence panel does not reload the work-program queue", () => {
  assert.equal(panel.includes("/api/workspace/finance/work-programs\""), false);
  assert.match(panel, /\/api\/workspace\/finance\/reviewer-evidence/);
  assert.match(panel, /Evidence before judgment/);
  assert.match(panel, /Accounting population/);
});

test("reviewer accounting populations paginate to completeness instead of silently truncating", () => {
  assert.match(runtime, /REVIEW_PAGE_SIZE = 1000/);
  assert.match(runtime, /\.range\(from, to\)/);
  assert.match(runtime, /population_complete: true/);
  assert.match(runtime, /will not present a silently truncated accounting population/);
  assert.equal(runtime.includes("slice(0, 50)"), false);
  assert.equal(runtime.includes("slice(0, 25)"), false);
});

test("reviewer evidence remains deterministic and governed", () => {
  assert.match(runtime, /does not infer journal impact from names or narrative text/);
  assert.match(workspace, /\/api\/workspace\/finance\/work-programs\/review-signoff/);
  assert.match(workspace, /\/api\/workspace\/finance\/work-programs\/lifecycle/);
  assert.match(panel, /segregation-of-duties/);
});
