import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workspace = fs.readFileSync(
  "components/creative/ProductionStudio/workspaces/TimelineWorkspace.jsx",
  "utf8",
);

test("Timeline workspace treats timeline runtime items as cut versions, not scenes", () => {
  assert.match(workspace, /const timelineItems = runtime\.timelineRuntime\?\.items \|\| \[\]/);
  assert.match(workspace, /const scenes = runtime\.sceneRuntime\?\.items \|\| \[\]/);
  assert.doesNotMatch(workspace, /const scenes\s*=\s*runtime\.timelineRuntime/);
  assert.match(workspace, /Cut versions/);
});

test("Timeline workspace reads real Avantiqo edit decisions before shot-cut fallback", () => {
  assert.match(workspace, /metadata\?\.edit_decision_list/);
  assert.match(workspace, /buildEdlCut/);
  assert.match(workspace, /buildShotCut/);
  assert.match(workspace, /const clips = edlClips\.length \? edlClips : shotClips/);
  assert.match(workspace, /AVANTIQO EDL/);
  assert.match(workspace, /SHOT CUT FALLBACK/);
});

test("Timeline master readiness fails closed on production and editorial blockers", () => {
  assert.match(workspace, /const masterReady = Boolean/);
  assert.match(workspace, /failedTasks\.length === 0/);
  assert.match(workspace, /reviewTasks\.length === 0/);
  assert.match(workspace, /runningTasks\.length === 0/);
  assert.match(workspace, /missingShotMedia === 0/);
  assert.match(workspace, /missingRequirements\.length === 0/);
  assert.match(workspace, /Master blocked/);
  assert.match(workspace, /Master is not releasable yet/);
});

test("Timeline workspace exposes professional edit evidence instead of fake status cards", () => {
  assert.match(workspace, /source_in_seconds/);
  assert.match(workspace, /timeline_in_seconds/);
  assert.match(workspace, /selection_score/);
  assert.match(workspace, /performance_verified/);
  assert.match(workspace, /Review holds/);
  assert.match(workspace, /Dialogue/);
  assert.match(workspace, /Music \/ SFX/);
  assert.match(workspace, /Captions/);
  assert.doesNotMatch(workspace, /scene\.status \|\| "Ready"/);
});
