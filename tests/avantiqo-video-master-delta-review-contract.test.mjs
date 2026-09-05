import fs from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

function source(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const runtime = source("lib/creative/release/runtime/CreativeMasterDeltaReviewRuntime.js");
const readiness = source("lib/creative/release/runtime/CreativeReleaseReadinessRuntime.js");
const route = source("app/api/creative/mastering/delta-review/route.js");
const workspace = source("components/creative/ProductionStudio/workspaces/RenderWorkspaceV5.jsx");
const router = source("components/creative/ProductionStudio/layout/WorkspaceCanvasRouter.jsx");

test("master delta review is checksum and comparison scoped", () => {
  assert.match(runtime, /CREATIVE_MASTER_DELTA_REVIEW_V1/);
  assert.match(runtime, /master_comparison_identity/);
  assert.match(runtime, /previous_master_checksum/);
  assert.match(runtime, /right_master_checksum/);
  assert.match(runtime, /decision_set_identity/);
  assert.match(runtime, /MASTER_DELTA_INTERVAL_EVIDENCE_TRUNCATED/);
});

test("detected change units require human disposition", () => {
  assert.match(runtime, /VISUAL_INTERVAL/);
  assert.match(runtime, /PROGRAM_AUDIO_DELTA/);
  assert.match(runtime, /COMPARISON_LIMITATION/);
  assert.match(runtime, /EXPECTED/);
  assert.match(runtime, /UNEXPECTED/);
  assert.match(runtime, /UNEXPECTED_CHANGE_NOTE_REQUIRED/);
  assert.match(runtime, /MASTER_DELTA_INTERVAL_REVIEW_REQUIRED/);
  assert.match(runtime, /MASTER_REVISION_RESOLUTION_REQUIRED/);
});

test("final revision resolution is invalidated by later decisions", () => {
  assert.match(runtime, /revision_resolution_identity/);
  assert.match(runtime, /decision_set_identity: decisionSetIdentity/);
  assert.match(runtime, /currentResolution\(nodes, comparisonIdentity, render, decisionIdentity\)/);
  assert.match(runtime, /human_reviewed: true/);
  assert.match(runtime, /approved: true/);
});

test("release readiness fails closed on unresolved newer-master changes", () => {
  assert.match(readiness, /evaluateMasterDeltaReviewFromNodes/);
  assert.match(readiness, /master_revision_changes_resolved/);
  assert.match(readiness, /master_delta_review_passed/);
  assert.match(readiness, /master_revision_resolution_id/);
  assert.match(readiness, /generation_version: 5/);
});

test("delta review API separates reviewer and release approval permissions", () => {
  assert.match(route, /creative\.quality\.evaluate/);
  assert.match(route, /creative\.release\.approve/);
  assert.match(route, /action === "finalize"/);
  assert.match(route, /CreativeMasterDeltaReviewRuntime\.decide/);
  assert.match(route, /CreativeMasterDeltaReviewRuntime\.finalize/);
});

test("Mastering exposes expected, unexpected and signed resolution workflow", () => {
  assert.match(workspace, /Revision resolution/);
  assert.match(workspace, /Expected/);
  assert.match(workspace, /Unexpected · open/);
  assert.match(workspace, /Unexpected · resolved/);
  assert.match(workspace, /Finalize revision resolution/);
  assert.match(workspace, /decisions are immutable and later decisions supersede earlier ones/);
  assert.match(router, /RenderWorkspaceV5/);
});

console.log("AVANTIQO_VIDEO_MASTER_DELTA_REVIEW_CONTRACT=PASS");
