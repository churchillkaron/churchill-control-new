import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const creativeRuntime = fs.readFileSync(
  "lib/creative/runtime/CreativeRuntime.js",
  "utf8",
);
const setRuntime = fs.readFileSync(
  "lib/creative/studio/runtime/CreativeChatShotSetRuntime.js",
  "utf8",
);
const planner = fs.readFileSync(
  "lib/creative/studio/capabilities/planStudioShotSetRevision.js",
  "utf8",
);
const executor = fs.readFileSync(
  "lib/creative/studio/capabilities/reviseStudioShotSet.js",
  "utf8",
);
const surgical = fs.readFileSync(
  "lib/creative/revisions/runtime/CreativeShotSurgicalRevisionRuntime.js",
  "utf8",
);
const projectState = fs.readFileSync(
  "lib/operator/contracts/OperatorProjectState.js",
  "utf8",
);

test("Creative runtime exposes separate multi-shot plan and confirmed execute capabilities", () => {
  assert.match(creativeRuntime, /planShotSetRevision:\s*\(\)\s*=>/);
  assert.match(creativeRuntime, /reviseShotSet:\s*\(\)\s*=>/);
  assert.match(planner, /operatorMode:\s*"read"/);
  assert.match(planner, /operatorAutoExecute:\s*true/);
  assert.match(planner, /operatorRequiresConfirmation:\s*false/);
  assert.match(executor, /operatorMode:\s*"write"/);
  assert.match(executor, /operatorAutoExecute:\s*false/);
  assert.match(executor, /operatorRequiresConfirmation:\s*true/);
  assert.match(executor, /boundary:\s*"conversation_confirmation"/);
});

test("shot-set planning is deterministic and bounded", () => {
  assert.match(setRuntime, /AVANTIQO_CHAT_SHOT_SET_V1/);
  assert.match(setRuntime, /createHash\("sha256"\)/);
  assert.match(setRuntime, /revision_number/);
  assert.match(setRuntime, /CREATIVE_CHAT_SHOT_SET_RANGE_OUT_OF_BOUNDS/);
  assert.match(setRuntime, /CREATIVE_CHAT_SHOT_SET_TOO_LARGE/);
  assert.match(setRuntime, /this scene/);
  assert.match(setRuntime, /sceneNumberFromReference/);
  assert.match(setRuntime, /CreativeChatShotReferenceRuntime\.resolve/);
});

test("confirmed execution rejects stale plans before revision", () => {
  const staleIndex = executor.indexOf("CREATIVE_CHAT_MULTI_REVISION_PLAN_STALE");
  const revisionIndex = executor.indexOf("CreativeChatShotRevisionRuntime.revise({");
  assert.ok(staleIndex >= 0, "stale-plan gate must exist");
  assert.ok(revisionIndex >= 0, "multi-shot revision must exist");
  assert.ok(staleIndex < revisionIndex, "stale plans must fail before any shot revision");
  assert.match(executor, /current_plan_fingerprint/);
  assert.match(executor, /submitted_plan_fingerprint/);
});

test("professional locks are preflighted and enforced in the core surgical engine", () => {
  const lockIndex = executor.indexOf("plan.professional_lock_conflicts.length");
  const revisionIndex = executor.indexOf("CreativeChatShotRevisionRuntime.revise({");
  assert.ok(lockIndex >= 0);
  assert.ok(lockIndex < revisionIndex, "batch lock preflight must happen before revision");

  assert.match(surgical, /CreativeProfessionalDirectionAuthorityRuntime\.stripLockedPatch/);
  assert.match(surgical, /boundary:\s*"TARGET"/);
  assert.match(surgical, /boundary:\s*"ADJACENT_REPAIR"/);
  const targetGuard = surgical.indexOf("assertProfessionalLocksPreserved({\n      shot: target");
  const targetWrite = surgical.indexOf("const updatedTarget = await applyTarget({");
  assert.ok(targetGuard >= 0);
  assert.ok(targetWrite >= 0);
  assert.ok(targetGuard < targetWrite, "core target lock guard must happen before target write");
});

test("multi-shot execution canonically verifies every revised shot without generating media", () => {
  const revisionIndex = executor.indexOf("CreativeChatShotRevisionRuntime.revise({");
  const rereadIndex = executor.indexOf("const shot = await ShotRuntime.get(row.shot_id)");
  assert.ok(revisionIndex >= 0);
  assert.ok(rereadIndex > revisionIndex, "canonical reread must follow revision execution");
  assert.match(executor, /CANONICAL_MULTI_SHOT_REREAD/);
  assert.match(executor, /media_generation_executed:\s*false/);
  assert.match(executor, /publish_authorized:\s*false/);
  assert.match(planner, /media_generation_executed:\s*false/);
  assert.match(planner, /publish_authorized:\s*false/);
});

test("verified multi-shot results participate in Operator Creative continuity", () => {
  assert.match(projectState, /"creative\.studio\.planShotSetRevision"/);
  assert.match(projectState, /"creative\.studio\.reviseShotSet"/);
  assert.match(executor, /selected_shot_id/);
  assert.match(executor, /selected_scene_id/);
  assert.match(executor, /selected_revision_number/);
});
