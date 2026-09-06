import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const runtime = read("lib/finance/tax/FinanceTaxEvidenceDrilldownRuntime.js");
const rail = read("components/workspace/finance/FinanceTaxEvidenceDrilldownRail.jsx");
const posting = read("components/workspace/finance/FinanceTaxPostingEvidenceReview.jsx");

test("VAT posting evidence stays bound to the existing live posting predicates", () => {
  assert.match(runtime, /dependencyCode === "OUTPUT_POSTING" && eligibleVatLines\.length/);
  assert.match(runtime, /const posted = invoiceJournals\.filter\(row => upper\(row\.status\) === "POSTED"\)/);
  assert.match(runtime, /const valid = posted\.filter\(row => row\.reversed !== true\)/);
  assert.match(runtime, /posted\.length \? "OUTPUT_POSTING_REVERSED" : "OUTPUT_NOT_POSTED"/);
  assert.match(runtime, /dependencyCode === "INPUT_POSTING" && eligibleVatLines\.length/);
  assert.match(runtime, /upper\(invoice\.status\) === "POSTED" && upper\(invoice\.approval_status\) === "APPROVED"/);
  assert.match(runtime, /Boolean\(invoice\.journal_entry_id\) && valid/);
  assert.match(runtime, /linkedJournal\.reversed !== true/);
  assert.match(runtime, /"INPUT_POSTING_REVERSED" : "INPUT_NOT_APPROVED_POSTED"/);
});

test("Posting blockers render an accountant-first document and journal proof instead of the generic evidence grid", () => {
  for (const marker of ["OUTPUT_NOT_POSTED", "OUTPUT_POSTING_REVERSED", "INPUT_NOT_APPROVED_POSTED", "INPUT_POSTING_REVERSED"]) {
    assert.match(posting, new RegExp(marker));
  }
  assert.match(posting, /function FinanceTaxPostingEvidenceReview/);
  assert.match(posting, /VAT posting proof/);
  assert.match(posting, /exact source document, posting state and journal proof/);
  assert.match(posting, /Source document/);
  assert.match(posting, /Document state/);
  assert.match(posting, /VAT amount affected/);
  assert.match(posting, /Posting link/);
  assert.match(posting, /Posting journal proof/);
  assert.match(posting, /Journal status/);
  assert.match(posting, /Posting date/);
  assert.match(posting, /Reversed/);
  assert.match(posting, /Approval · \$\{approvalStatus\}/);
  assert.match(posting, /Evidence cannot post, approve, unreverse or mark this blocker fixed/);
  assert.match(posting, /Live Tax preflight clears it only after governed source accounting truth satisfies the posting predicate/);
});

test("Posting repair stays on the exact governed source record with no manual completion authority", () => {
  assert.match(rail, /FinanceTaxPostingEvidenceReview/);
  assert.match(rail, /isFinanceTaxPostingIssue/);
  assert.match(rail, /const postingIssue = isFinanceTaxPostingIssue\(issue\.code\)/);
  assert.match(rail, /<FinanceTaxPostingEvidenceReview issue=\{issue\} source=\{source\} journal=\{journal\} navigation=\{navigation\}\/>/);
  assert.match(rail, /!codingIssue && !postingIssue/);
  assert.match(posting, /Fix this sales posting/);
  assert.match(posting, /Fix this purchase posting/);
  assert.match(posting, /navigation\?\.href/);
  assert.doesNotMatch(posting, /Mark posting fixed|Acknowledge posting|Resolve posting|Dismiss posting/);
});
