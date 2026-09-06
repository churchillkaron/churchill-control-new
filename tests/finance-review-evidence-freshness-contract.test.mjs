import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildFinanceReviewEvidenceFingerprint,
  compareFinanceReviewEvidenceFingerprints,
  evaluateFinanceReviewEvidenceFreshness,
} from "../lib/finance/practice/FinanceReviewEvidenceFreshness.js";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const signoffRoute = read("app/api/workspace/finance/work-programs/review-signoff/route.js");
const evidenceRoute = read("app/api/workspace/finance/reviewer-evidence/route.js");
const evidencePanel = read("components/workspace/finance/FinanceReviewerEvidencePanel.jsx");

function baseEvidence() {
  return {
    run: { id: "run-1", organization_id: "org-1", entity_id: "entity-1", period_id: "period-1" },
    work_item: {
      id: "work-1",
      conclusion: "Balance is supported by the reconciled population.",
      evidence: { reconciliation_id: "rec-1" },
      metadata: { evidence_required: true },
      updated_at: "2026-09-01T00:00:00Z",
    },
    review_item: { id: "review-1", organization_id: "org-1", entity_id: "entity-1", period_id: "period-1" },
    period: {
      source: "accounting_periods",
      current: { id: "period-1", start_date: "2026-08-01", end_date: "2026-08-31", status: "open", closed_at: null },
      previous: { id: "period-0", start_date: "2026-07-01", end_date: "2026-07-31", status: "closed", closed_at: "2026-08-05T00:00:00Z" },
    },
    evidence: {
      links: [{
        id: "link-1",
        document_id: "doc-1",
        evidence_category: "BANK_STATEMENT",
        status: "ACTIVE",
        is_primary: true,
        updated_at: "2026-09-01T00:00:00Z",
        document: {
          id: "doc-1",
          source: "CONTROLLED",
          controlled: true,
          status: "approved",
          approval_required: true,
          approved_at: "2026-09-01T00:00:00Z",
          version_number: 2,
          checksum_sha256: "abc123",
          updated_at: "2026-09-01T00:00:00Z",
        },
      }],
    },
    system_verification: { mode: "BANK_RECONCILIATION", applicable: true, satisfied: true, checked_at: "2026-09-01T00:00:00Z", invalidated_at: null, blockers: [], evidence: [{ id: "rec-1" }] },
    ledger_impact: {
      population: { linked_lines: 1, journal_entries: 1 },
      journal_entries: [{ id: "journal-1", posting_date: "2026-08-31", status: "POSTED", reversed: false }],
      linked_lines: [{ id: "gl-1", account_id: "account-1", debit: 100, credit: 0, posting_date: "2026-08-31" }],
      accounts: [{ account_id: "account-1", account_code: "1000", account_name: "Cash", linked_impact: { net: 100 }, current_period_movement: { net: 100 } }],
    },
    control_records: { reconciliations: [{ id: "rec-1", status: "COMPLETE", difference_amount: 0 }], filings: [], close_runs: [] },
  };
}

function reviewerSignoff(fingerprint) {
  return {
    id: "signoff-1",
    signoff_role: "REVIEWER",
    signed_by: "reviewer-1",
    metadata: { review_evidence_fingerprint: fingerprint },
  };
}

test("Finance review fingerprint is deterministic across non-semantic array ordering", () => {
  const evidence = baseEvidence();
  const first = buildFinanceReviewEvidenceFingerprint(evidence);
  evidence.system_verification.evidence = [{ id: "b" }, { id: "a" }];
  const ordered = buildFinanceReviewEvidenceFingerprint(evidence);
  evidence.system_verification.evidence = [{ id: "a" }, { id: "b" }];
  const reordered = buildFinanceReviewEvidenceFingerprint(evidence);
  assert.notEqual(first.digest, ordered.digest);
  assert.equal(ordered.digest, reordered.digest);
});

test("Unrelated work-item timestamps do not invalidate accounting review evidence", () => {
  const evidence = baseEvidence();
  const stored = buildFinanceReviewEvidenceFingerprint(evidence);
  evidence.work_item.updated_at = "2026-09-06T09:00:00Z";
  const current = buildFinanceReviewEvidenceFingerprint(evidence);
  assert.equal(current.digest, stored.digest);
  assert.equal(compareFinanceReviewEvidenceFingerprints(stored, current).matches, true);
});

test("A changed exact GL amount makes the reviewer sign-off stale", () => {
  const evidence = baseEvidence();
  const stored = buildFinanceReviewEvidenceFingerprint(evidence);
  evidence.ledger_impact.linked_lines[0].debit = 125;
  const freshness = evaluateFinanceReviewEvidenceFreshness({ evidence, reviewerSignoff: reviewerSignoff(stored) });
  assert.equal(freshness.state, "STALE");
  assert.equal(freshness.trusted, false);
  assert.ok(freshness.changed_sections.includes("ledger_exact"));
  assert.ok(freshness.changed_labels.includes("Exact linked ledger evidence changed"));
});

test("A controlled document version or checksum change makes the reviewer sign-off stale", () => {
  const evidence = baseEvidence();
  const stored = buildFinanceReviewEvidenceFingerprint(evidence);
  evidence.evidence.links[0].document.version_number = 3;
  evidence.evidence.links[0].document.checksum_sha256 = "def456";
  const freshness = evaluateFinanceReviewEvidenceFreshness({ evidence, reviewerSignoff: reviewerSignoff(stored) });
  assert.equal(freshness.state, "STALE");
  assert.ok(freshness.changed_sections.includes("evidence_documents"));
});

test("Legacy reviewer sign-offs without a fingerprint fail closed as unproven", () => {
  const evidence = baseEvidence();
  const freshness = evaluateFinanceReviewEvidenceFreshness({ evidence, reviewerSignoff: reviewerSignoff(null) });
  assert.equal(freshness.state, "UNPROVEN");
  assert.equal(freshness.trusted, false);
  assert.match(freshness.reason, /predates deterministic evidence freshness/i);
});

test("Reviewer idempotency and partner clearance both require live evidence freshness", () => {
  const evidenceBuild = signoffRoute.indexOf("const evidence = await buildFinanceReviewerEvidence");
  const reviewerIdempotency = signoffRoute.indexOf("existingFreshness.trusted");
  assert.ok(evidenceBuild >= 0 && reviewerIdempotency > evidenceBuild, "Reviewer idempotency must happen only after live evidence rebuild");
  assert.match(signoffRoute, /review_evidence_fingerprint: currentFingerprint/);
  assert.match(signoffRoute, /buildPortfolioFreshness/);
  assert.match(signoffRoute, /Partner clearance requires current reviewer evidence/);
  assert.match(signoffRoute, /freshness\?\.trusted !== true/);
  assert.match(signoffRoute, /ACCOUNTING_PARTNER_SIGNOFF_INVALIDATED_BY_EVIDENCE_CHANGE/);
});

test("Reviewer evidence API and cockpit expose exact stale-review guidance", () => {
  assert.match(evidenceRoute, /evaluateFinanceReviewEvidenceFreshness/);
  assert.match(evidenceRoute, /review_freshness: reviewFreshness/);
  assert.match(evidencePanel, /Freshness baseline not signed yet/);
  assert.match(evidencePanel, /Review current/);
  assert.match(evidencePanel, /Re-review required/);
  assert.match(evidencePanel, /changed_labels/);
  assert.match(evidencePanel, /Partner clearance remains blocked until the review is current/);
});
