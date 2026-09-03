import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflowPolicy = fs.readFileSync(
  new URL("../lib/finance/ui/FinanceHumanWorkflowPolicy.js", import.meta.url),
  "utf8",
);
const clientDependencyPolicy = fs.readFileSync(
  new URL("../lib/finance/ui/FinanceClientDependencyPolicy.js", import.meta.url),
  "utf8",
);
const clientDependencyRail = fs.readFileSync(
  new URL("../components/workspace/finance/FinanceClientDependencyRail.jsx", import.meta.url),
  "utf8",
);
const engagementClientDependencyPanel = fs.readFileSync(
  new URL("../components/workspace/finance/FinanceEngagementClientDependencyPanel.jsx", import.meta.url),
  "utf8",
);
const engagementFile = fs.readFileSync(
  new URL("../components/workspace/finance/FinanceEngagementFile.jsx", import.meta.url),
  "utf8",
);
const financeWorkPage = fs.readFileSync(
  new URL("../app/(system)/workspace/[organizationId]/finance/work/page.jsx", import.meta.url),
  "utf8",
);
const presentationPolicy = fs.readFileSync(
  new URL("../lib/finance/ui/FinanceCapabilityPresentation.js", import.meta.url),
  "utf8",
);
const areaHub = fs.readFileSync(
  new URL("../components/workspace/finance/FinanceAreaHub.jsx", import.meta.url),
  "utf8",
);
const reviewerWorkspace = fs.readFileSync(
  new URL("../components/workspace/finance/FinanceReviewerWorkspace.jsx", import.meta.url),
  "utf8",
);
const reviewSignoffRoute = fs.readFileSync(
  new URL("../app/api/workspace/finance/work-programs/review-signoff/route.js", import.meta.url),
  "utf8",
);
const runtimeManifest = JSON.parse(
  fs.readFileSync(
    new URL("../lib/finance/runtime/financeCapabilityRuntimeManifest.json", import.meta.url),
    "utf8",
  ),
);

test("Finance human workflow has explicit human handoffs from preparation through close", () => {
  for (const stage of ["prepare", "client", "review", "changes", "partner", "close"]) {
    assert.match(workflowPolicy, new RegExp(`id: "${stage}"`));
  }

  assert.match(workflowPolicy, /ownerRole: "PREPARER"/);
  assert.match(workflowPolicy, /ownerRole: "REVIEWER"/);
  assert.match(workflowPolicy, /ownerRole: "PARTNER"/);
  assert.match(workflowPolicy, /WAITING_ON_CLIENT/);
  assert.match(workflowPolicy, /READY_FOR_REVIEW/);
  assert.match(workflowPolicy, /CHANGES_REQUESTED/);
  assert.match(workflowPolicy, /reviewed_pending_partner/);
});

test("Finance priority policy protects human attention from waiting work", () => {
  const changesIndex = workflowPolicy.indexOf('status === "CHANGES_REQUESTED"');
  const blockedIndex = workflowPolicy.indexOf('status === "BLOCKED"');
  const inProgressIndex = workflowPolicy.indexOf('status === "IN_PROGRESS"');
  const waitingIndex = workflowPolicy.indexOf('status === "WAITING_ON_CLIENT"');

  assert.ok(changesIndex >= 0 && blockedIndex > changesIndex);
  assert.ok(inProgressIndex > blockedIndex);
  assert.ok(waitingIndex > inProgressIndex);
  assert.match(workflowPolicy, /do not let it displace work the team can execute now/);
});

test("Finance client dependency intelligence suppresses duplicate chasing after a response", () => {
  const responseIndex = clientDependencyPolicy.indexOf("financeClientRequestHasResponse(request)");
  const followUpIndex = clientDependencyPolicy.indexOf('state: "FOLLOW_UP_DUE"');
  assert.ok(responseIndex >= 0 && followUpIndex > responseIndex);
  assert.match(clientDependencyPolicy, /state: "CLIENT_RESPONDED"/);
  assert.match(clientDependencyPolicy, /Review what the client supplied before any further reminder is considered/);
  assert.match(clientDependencyPolicy, /safeToFollowUp: false/);
});

test("Finance client dependency intelligence protects recent client contact from duplicate reminders", () => {
  assert.match(clientDependencyPolicy, /state: "WAITING_NO_CHASE"/);
  assert.match(clientDependencyPolicy, /The client was already contacted/);
  assert.match(clientDependencyPolicy, /nextEligibleFollowUpAt/);
  assert.match(clientDependencyPolicy, /safeToFollowUp: false/);
  assert.match(clientDependencyPolicy, /follow up on the existing request rather than creating a duplicate request/i);
});

test("Finance client dependency intelligence restores secure access before any chase", () => {
  const accessIndex = clientDependencyPolicy.indexOf('state: "ACCESS_EXPIRED"');
  const followUpIndex = clientDependencyPolicy.indexOf('state: "FOLLOW_UP_DUE"');
  assert.ok(accessIndex >= 0 && followUpIndex > accessIndex);
  assert.match(clientDependencyPolicy, /metadata\?\.client_access/);
  assert.match(clientDependencyPolicy, /Restore access before any reminder or follow-up/);
  assert.match(clientDependencyPolicy, /Reissue secure access for the existing request/);
  assert.match(clientDependencyPolicy, /safeToFollowUp: false/);
});

test("Finance client dependency intelligence preserves human control for manual overdue follow-up", () => {
  assert.match(clientDependencyPolicy, /state: overdue \? "MANUAL_FOLLOW_UP" : "WAITING_MANUAL"/);
  assert.match(clientDependencyPolicy, /Follow-up needs a human decision/);
  assert.match(clientDependencyPolicy, /Decide whether to follow up on the existing request/);
});

test("Finance Work surfaces client dependency intelligence without sending client communication", () => {
  assert.match(financeWorkPage, /FinanceClientDependencyRail/);
  assert.match(clientDependencyRail, /Client dependency intelligence/);
  assert.match(clientDependencyRail, /Do not chase/);
  assert.match(clientDependencyRail, /resolveFinanceClientDependency/);
  assert.match(clientDependencyRail, /client_request: clientRequest/);
  assert.match(clientDependencyRail, /no automatic message is sent from this panel/i);
  assert.doesNotMatch(clientDependencyRail, /fetch\([^\n]*(send|remind|message)/i);
});

test("Finance engagement file puts dependency intelligence beside current accounting work", () => {
  assert.match(engagementFile, /FinanceEngagementClientDependencyPanel/);
  assert.match(engagementFile, /<FinanceEngagementClientDependencyPanel run=\{currentRun\} \/>/);
  assert.match(engagementClientDependencyPanel, /What is missing, what changed, and what to do next/);
  assert.match(engagementClientDependencyPanel, /ACCESS_EXPIRED/);
  assert.match(engagementClientDependencyPanel, /Do not chase/);
  assert.match(engagementClientDependencyPanel, /Next safe action/);
  assert.match(engagementClientDependencyPanel, /this panel sends nothing automatically/i);
  assert.doesNotMatch(engagementClientDependencyPanel, /fetch\(/i);
});

test("Every declared Finance runtime capability can override stale planned presentation state", () => {
  assert.ok(Object.keys(runtimeManifest).length >= 60);
  assert.match(presentationPolicy, /runtimeBacked && declaredStatus\.toLowerCase\(\) === "planned"/);
  assert.match(presentationPolicy, /item\.status = readiness\.effectiveStatus/);
  assert.match(presentationPolicy, /runtime_backed: readiness\.runtimeBacked/);
  assert.match(presentationPolicy, /effective_status:/);
});

test("Finance UI still protects genuinely unavailable capabilities", () => {
  assert.match(areaHub, /"planned", "blocked", "disabled", "unavailable"/);
  assert.match(presentationPolicy, /declaredStatus\.toLowerCase\(\) === "planned"/);
  assert.doesNotMatch(presentationPolicy, /declaredStatus\.toLowerCase\(\) === "blocked"[\s\S]*effectiveStatus:\s*"active"/);
});

test("Finance reviewer and partner sign-off is assignment-aware and segregation-safe", () => {
  assert.match(reviewSignoffRoute, /assigned_reviewer_id/);
  assert.match(reviewSignoffRoute, /assigned_partner_id/);
  assert.match(reviewSignoffRoute, /Only the assigned/);
  assert.match(reviewSignoffRoute, /Segregation of duties blocks the preparer/);
  assert.match(reviewSignoffRoute, /same user from signing/);
  assert.match(reviewSignoffRoute, /Preparer sign-off is required before reviewer clearance/);
  assert.match(reviewSignoffRoute, /Reviewer sign-off missing/);
  assert.match(reviewSignoffRoute, /Resolve all open review points before partner clearance/);
});

test("Finance partner clearance is portfolio scoped to client entity and period", () => {
  assert.match(reviewSignoffRoute, /scopedReviewItems\(run\)/);
  assert.match(reviewSignoffRoute, /\.eq\("organization_id", run\.organization_id\)/);
  assert.match(reviewSignoffRoute, /run\.entity_id \? query\.eq\("entity_id", run\.entity_id\)/);
  assert.match(reviewSignoffRoute, /run\.period_id \? query\.eq\("period_id", run\.period_id\)/);
  assert.match(reviewSignoffRoute, /accounting_work_program_portfolio_clearance/);
  assert.match(reviewSignoffRoute, /ACCOUNTING_PARTNER_PORTFOLIO_CLEARANCE/);
  assert.match(reviewSignoffRoute, /review_item_count: reviewItemIds\.length/);
});

test("Finance review UI signs before it completes reviewer and partner work", () => {
  const signoffEndpoint = reviewerWorkspace.indexOf('fetch("/api/workspace/finance/work-programs/review-signoff"');
  const completeEndpoint = reviewerWorkspace.indexOf('action: "complete_item"', signoffEndpoint);
  assert.ok(signoffEndpoint >= 0);
  assert.ok(completeEndpoint > signoffEndpoint);
  assert.match(reviewerWorkspace, /governedSignoffAndComplete\(row, "REVIEWER"\)/);
  assert.match(reviewerWorkspace, /governedSignoffAndComplete\(row, "PARTNER"\)/);
  assert.match(reviewerWorkspace, /Reviewer\/partner identity, review points, sign-offs, dependencies, evidence and accounting-truth gates are rechecked server-side/);
});

test("Finance reviewer and partner signoffs are safe to retry after downstream lifecycle blockers", () => {
  assert.match(reviewSignoffRoute, /existingReviewer/);
  assert.match(reviewSignoffRoute, /idempotent: true/);
  assert.match(reviewSignoffRoute, /alreadyClearedByActor/);
  assert.match(reviewSignoffRoute, /Reviewer sign-off is already owned by another reviewer/);
  assert.match(reviewSignoffRoute, /Partner clearance is already owned by another partner/);
  assert.match(reviewSignoffRoute, /row\.signoff_role !== "REVIEWER" && actorMatches\(access, row\.signed_by\)/);
  assert.match(reviewSignoffRoute, /row\.signoff_role !== "PARTNER" && actorMatches\(access, row\.signed_by\)/);
});
