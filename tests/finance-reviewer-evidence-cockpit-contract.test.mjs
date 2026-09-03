import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const reviewPage = read("app/(system)/workspace/[organizationId]/finance/review/page.jsx");
const cockpit = read("components/workspace/finance/FinanceReviewerEvidenceCockpit.jsx");
const route = read("app/api/workspace/finance/reviewer-evidence/route.js");
const runtime = read("lib/finance/practice/FinanceReviewerEvidenceRuntime.js");

test("review page surfaces the evidence cockpit before the decision workspace", () => {
  assert.match(reviewPage, /FinanceReviewerEvidenceCockpit/);
  assert.ok(reviewPage.indexOf("<FinanceReviewerEvidenceCockpit") < reviewPage.indexOf("<FinanceReviewerWorkspace"));
});

test("reviewer evidence cockpit compresses source evidence, ledger impact and prior-period context", () => {
  assert.match(cockpit, /Reviewer evidence cockpit/);
  assert.match(cockpit, /Evidence before judgment/);
  assert.match(cockpit, /Preparer conclusion/);
  assert.match(cockpit, /Prior-period work/);
  assert.match(cockpit, /Ledger and journal impact/);
  assert.match(cockpit, /Source documents/);
  assert.match(cockpit, /Reviewer trail/);
});

test("reviewer evidence endpoint preserves firm scope and Finance view authorization", () => {
  assert.match(route, /requireOrganizationAccess/);
  assert.match(route, /checkFinancePermission/);
  assert.match(route, /permissionKey: "finance.view"/);
  assert.match(route, /buildFinanceReviewerEvidence/);
});

test("ledger impact is deterministic and never inferred from account names or narrative text", () => {
  assert.match(runtime, /No deterministic ledger linkage was found/);
  assert.match(runtime, /does not infer journal impact from names or narrative text/);
  assert.match(runtime, /review\.record_key/);
  assert.match(runtime, /evidence_link\.document_id/);
  assert.match(runtime, /journal_entry_id/);
  assert.match(runtime, /reference_id/);
  assert.doesNotMatch(runtime, /similarity|embedding|fuzzy/i);
});

test("reviewer cockpit reuses governed evidence, review-note and sign-off records", () => {
  assert.match(runtime, /accounting_work_program_evidence_links/);
  assert.match(runtime, /finance_review_notes/);
  assert.match(runtime, /finance_review_signoffs/);
  assert.match(runtime, /getFinanceEvidenceDocument/);
  assert.match(cockpit, /Evidence is read-only here/);
});
