import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  evaluateFinanceReviewerDecisionReadiness,
  summarizeFinanceReviewerEvidencePreflight,
} from "../lib/finance/practice/FinanceReviewerDecisionReadiness.js";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const signoffRoute = read("app/api/workspace/finance/work-programs/review-signoff/route.js");

function readyEvidence(overrides = {}) {
  return {
    work_item: {
      id: "work-1",
      conclusion: "Prepared balance is supported by the governed evidence.",
      blocked_reason: null,
      evidence: { reconciliation_reference: "REC-100" },
      metadata: { evidence_required: true },
      ...(overrides.work_item || {}),
    },
    review_item: { id: "review-1" },
    system_verification: {
      applicable: true,
      satisfied: true,
      checked_at: "2026-09-04T00:00:00.000Z",
      invalidated_at: null,
      blockers: [],
      ...(overrides.system_verification || {}),
    },
    review_control: {
      open_points: 0,
      ...(overrides.review_control || {}),
    },
    evidence: {
      active_count: 1,
      controlled_count: 1,
      approval_pending: 0,
      links: [{
        id: "link-1",
        document_id: "doc-1",
        status: "ACTIVE",
        document: {
          id: "doc-1",
          controlled: true,
          version_number: 3,
          checksum_sha256: "abc123",
          approval_required: true,
          approved_at: "2026-09-03T00:00:00.000Z",
          status: "approved",
        },
      }],
      ...(overrides.evidence || {}),
    },
    ledger_impact: {
      linked: true,
      population_complete: true,
      population: { linked_lines: 8, current_period_lines: 42 },
      ...(overrides.ledger_impact || {}),
    },
  };
}

test("review readiness only becomes ready when the governed accounting evidence chain is complete", () => {
  const result = evaluateFinanceReviewerDecisionReadiness(readyEvidence());
  assert.equal(result.ready, true);
  assert.equal(result.state, "READY");
  assert.deepEqual(result.blockers, []);
  assert.equal(result.controls.conclusion_present, true);
  assert.equal(result.controls.required_evidence_satisfied, true);
  assert.equal(result.controls.ledger_population_complete, true);
});

test("review readiness blocks the material evidence failure modes competitors surface before sign-off", () => {
  const cases = [
    ["missing conclusion", { work_item: { conclusion: "" } }, /conclusion/i],
    ["open review point", { review_control: { open_points: 2 } }, /open review point/i],
    ["pending evidence approval", { evidence: { approval_pending: 1 } }, /approval/i],
    ["invalidated system check", { system_verification: { invalidated_at: "2026-09-04T01:00:00.000Z" } }, /invalidated/i],
    ["incomplete population", { ledger_impact: { population_complete: false } }, /population/i],
  ];

  for (const [name, override, pattern] of cases) {
    const result = evaluateFinanceReviewerDecisionReadiness(readyEvidence(override));
    assert.equal(result.ready, false, name);
    assert.match(result.blockers.join(" | "), pattern, name);
  }
});

test("review sign-off rebuilds governed evidence and records its decision-boundary preflight", () => {
  assert.match(signoffRoute, /buildFinanceReviewerEvidence\(\{/);
  assert.match(signoffRoute, /evaluateFinanceReviewerDecisionReadiness\(evidence\)/);
  assert.match(signoffRoute, /Reviewer clearance is blocked by governed evidence/);
  assert.match(signoffRoute, /reviewer_evidence_preflight:\s*evidencePreflight/);
  assert.match(signoffRoute, /summarizeFinanceReviewerEvidencePreflight\(evidence, readiness\)/);
});

test("review preflight snapshot carries controlled-document and exact-population lineage", () => {
  const evidence = readyEvidence();
  const readiness = evaluateFinanceReviewerDecisionReadiness(evidence);
  const snapshot = summarizeFinanceReviewerEvidencePreflight(evidence, readiness, "2026-09-04T02:00:00.000Z");
  assert.equal(snapshot.ready, true);
  assert.equal(snapshot.checked_at, "2026-09-04T02:00:00.000Z");
  assert.equal(snapshot.ledger_population.complete, true);
  assert.equal(snapshot.ledger_population.linked_lines, 8);
  assert.equal(snapshot.evidence_documents[0].document_id, "doc-1");
  assert.equal(snapshot.evidence_documents[0].version_number, 3);
  assert.equal(snapshot.evidence_documents[0].checksum_sha256, "abc123");
});
