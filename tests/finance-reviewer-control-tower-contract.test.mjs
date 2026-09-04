import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildFinanceReviewerControlTower } from "../lib/finance/practice/FinanceReviewerControlTowerRuntime.js";

const generatedAt = "2026-09-04T02:00:00.000Z";
const engagements = [{ id: "eng-1", organization_id: "client-1" }];
const profiles = [{
  organization_id: "client-1",
  assigned_accountant_id: "accountant-1",
  assigned_accountant_name: "Accountant",
  assigned_reviewer_id: "reviewer-1",
  assigned_reviewer_name: "Reviewer",
  assigned_partner_id: "partner-1",
  assigned_partner_name: "Partner",
}];
const runs = [{
  id: "run-1",
  engagement_id: "eng-1",
  organization_id: "client-1",
  entity_id: "entity-1",
  period_id: "period-1",
  status: "READY_FOR_REVIEW",
  due_at: "2026-09-03T00:00:00.000Z",
}];
const workItems = [
  {
    id: "work-verified",
    run_id: "run-1",
    organization_id: "client-1",
    required_role: "PREPARER",
    status: "READY_FOR_REVIEW",
    title: "Bank reconciliation",
    due_at: "2026-09-03T00:00:00.000Z",
    finance_review_item_id: "review-1",
    conclusion: "Prepared and reconciled.",
    budget_minutes: 60,
    metadata: {
      review_handoff_preflight: {
        ready: true,
        work_item_id: "work-verified",
        review_item_id: "review-1",
        blockers: [],
        controls: {
          ledger_population_complete: true,
          open_review_points: 0,
          approval_pending: 0,
        },
      },
    },
  },
  {
    id: "work-live-preflight",
    run_id: "run-1",
    organization_id: "client-1",
    required_role: "PREPARER",
    status: "READY_FOR_REVIEW",
    title: "VAT workpaper",
    finance_review_item_id: "review-2",
    conclusion: "Prepared.",
    budget_minutes: 30,
    metadata: {},
  },
  {
    id: "work-partner",
    run_id: "run-1",
    organization_id: "client-1",
    required_role: "PARTNER",
    status: "READY",
    title: "Partner clearance",
    budget_minutes: 20,
  },
];
const clientRequests = [{
  id: "request-1",
  run_id: "run-1",
  organization_id: "client-1",
  status: "SENT",
  due_at: "2026-09-02T00:00:00.000Z",
}];
const organizations = [{ id: "client-1", name: "Client One" }];

function buildTower() {
  return buildFinanceReviewerControlTower({
    engagements,
    profiles,
    runs,
    workItems,
    clientRequests,
    organizations,
    viewer: { staff_account_id: "reviewer-1", name: "Reviewer" },
    generatedAt,
    sources: {
      engagements: { complete: true },
      profiles: { complete: true },
      runs: { complete: true },
      work_items: { complete: true },
      client_requests: { complete: true },
      organizations: { complete: true },
    },
  });
}

test("reviewer tower separates verified handoff from live preflight and partner clearance", () => {
  const tower = buildTower();
  assert.equal(tower.summary.verified_handoffs, 1);
  assert.equal(tower.summary.live_preflight_required, 1);
  assert.equal(tower.summary.partner_clearance, 1);
  assert.equal(tower.summary.overdue_client_requests, 1);
  assert.equal(tower.queue.find((row) => row.id === "work-verified")?.stage, "VERIFIED_HANDOFF");
  assert.equal(tower.queue.find((row) => row.id === "work-live-preflight")?.stage, "LIVE_PREFLIGHT_REQUIRED");
  assert.equal(tower.queue.find((row) => row.id === "work-partner")?.stage, "PARTNER_CLEARANCE");
});

test("review-ready preparer work is owned by reviewer and never authorizes from queue state", () => {
  const tower = buildTower();
  const row = tower.queue.find((item) => item.id === "work-verified");
  assert.equal(row?.owner_id, "reviewer-1");
  assert.equal(row?.owner_name, "Reviewer");
  assert.ok(tower.queue.every((item) => item.requires_live_signoff_preflight === true));
  assert.equal(tower.integrity.final_authorization, "LIVE_REVIEW_SIGNOFF_PREFLIGHT");
  assert.equal(tower.integrity.queue_truth, "SERVER_GENERATED");
});

test("reviewer tower fails closed when any source population is incomplete", () => {
  const tower = buildFinanceReviewerControlTower({
    engagements,
    profiles,
    runs,
    workItems,
    clientRequests,
    organizations,
    sources: { work_items: { complete: false } },
    generatedAt,
  });
  assert.equal(tower.integrity.complete, false);
});

test("reviewer control tower route uses exact paginated Finance population contracts", () => {
  const route = fs.readFileSync(new URL("../app/api/workspace/finance/reviewer-control-tower/route.js", import.meta.url), "utf8");
  assert.match(route, /fetchCompleteFinancePopulation/);
  assert.doesNotMatch(route, /\.limit\s*\(\s*(500|1000|5000|10000)\s*\)/);
  assert.match(route, /Reviewer control tower population completeness could not be proven/);
  assert.match(route, /return jsonError\("Reviewer control tower population completeness could not be proven", 503/);
  assert.match(route, /buildFinanceReviewerControlTower/);
});
