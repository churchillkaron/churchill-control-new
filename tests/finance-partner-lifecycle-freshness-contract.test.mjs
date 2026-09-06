import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const lifecycleFreshness = read("lib/finance/practice/FinancePartnerLifecycleFreshnessGate.js");
const reviewGate = read("lib/finance/practice/engagementReviewGate.js");
const lifecycleRoute = read("app/api/workspace/finance/work-programs/lifecycle/route.js");

test("Partner lifecycle freshness rebuilds governed reviewer evidence at the final boundary", () => {
  assert.match(lifecycleFreshness, /buildFinanceReviewerEvidence/);
  assert.match(lifecycleFreshness, /evaluateFinanceReviewEvidenceFreshness/);
  assert.match(lifecycleFreshness, /finance_review_signoffs/);
  assert.match(lifecycleFreshness, /signoff_role\", \"REVIEWER\"/);
  assert.match(lifecycleFreshness, /\.is\(\"revoked_at\", null\)/);
  assert.match(lifecycleFreshness, /FRESHNESS_CONCURRENCY = 4/);
  assert.match(lifecycleFreshness, /REVIEW_EVIDENCE_STALE_AT_LIFECYCLE/);
  assert.match(lifecycleFreshness, /REVIEW_EVIDENCE_UNPROVEN_AT_LIFECYCLE/);
  assert.match(lifecycleFreshness, /changed_sections/);
  assert.match(lifecycleFreshness, /changed_labels/);
  assert.match(lifecycleFreshness, /reviewer_owner_id/);
});

test("Partner final clearance cannot satisfy the engagement gate on stale or unproven evidence", () => {
  assert.match(reviewGate, /FinancePartnerLifecycleFreshnessGate/);
  assert.match(reviewGate, /PARTNER_FINAL_CLEARANCE/);
  assert.match(reviewGate, /evaluateFinancePartnerLifecycleFreshness/);
  assert.match(reviewGate, /satisfied: evidenceFreshness\.satisfied === true/);
  assert.match(reviewGate, /Partner clearance cannot complete because reviewer evidence is stale or unproven/);
  assert.match(reviewGate, /error\.status = 409/);
});

test("The lifecycle route revalidates freshness both at partner work-item completion and complete_run", () => {
  const workItemGate = lifecycleRoute.indexOf("const engagementReviewGate = await requireEngagementReviewGate({ run, workItem: item })");
  const workItemUpdate = lifecycleRoute.indexOf('.from("accounting_engagement_work_items")', workItemGate);
  assert.ok(workItemGate >= 0 && workItemUpdate > workItemGate, "Partner work item must revalidate before completion update");

  const completeRunIndex = lifecycleRoute.indexOf('if (action === "complete_run")');
  const finalGateIndex = lifecycleRoute.indexOf("await requireEngagementReviewGate({ run, workItem: finalReviewItem })", completeRunIndex);
  const runLockIndex = lifecycleRoute.indexOf('.update({ status: "COMPLETE", completed_at: now, locked_at: now', completeRunIndex);
  assert.ok(completeRunIndex >= 0 && finalGateIndex > completeRunIndex, "complete_run must invoke final review freshness");
  assert.ok(runLockIndex > finalGateIndex, "Engagement lock must happen only after final freshness revalidation");
});

test("A mutation between partner sign-off and final engagement lock cannot be trusted by status alone", () => {
  assert.match(lifecycleFreshness, /Current reviewer evidence could not be completely rebuilt at lifecycle completion/);
  assert.match(lifecycleFreshness, /trusted !== true/);
  assert.match(reviewGate, /evidence_freshness: evidenceFreshness/);
  assert.match(lifecycleRoute, /review_clearance: finalReviewSnapshot/);
});
