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
const atomicRuntime = fs.readFileSync(
  "lib/creative/revisions/runtime/CreativeAtomicShotSetRevisionRuntime.js",
  "utf8",
);
const restore = fs.readFileSync(
  "lib/creative/studio/capabilities/restoreStudioShotSetRevision.js",
  "utf8",
);
const migration = fs.readFileSync(
  "supabase/migrations/20260904052500_creative_atomic_shot_set_revision.sql",
  "utf8",
);
const projectState = fs.readFileSync(
  "lib/operator/contracts/OperatorProjectState.js",
  "utf8",
);

test("Creative runtime separates read-only plan, confirmed atomic execute and confirmed restore", () => {
  assert.match(creativeRuntime, /planShotSetRevision:\s*\(\)\s*=>/);
  assert.match(creativeRuntime, /reviseShotSet:\s*\(\)\s*=>/);
  assert.match(creativeRuntime, /restoreShotSetRevision:\s*\(\)\s*=>/);

  assert.match(planner, /operatorMode:\s*"read"/);
  assert.match(planner, /operatorAutoExecute:\s*true/);
  assert.match(planner, /operatorRequiresConfirmation:\s*false/);

  for (const capability of [executor, restore]) {
    assert.match(capability, /operatorMode:\s*"write"/);
    assert.match(capability, /operatorAutoExecute:\s*false/);
    assert.match(capability, /operatorRequiresConfirmation:\s*true/);
    assert.match(capability, /boundary:\s*"conversation_confirmation"/);
  }
});

test("shot-set planning is deterministic and bounded before any write", () => {
  assert.match(setRuntime, /AVANTIQO_CHAT_SHOT_SET_V1/);
  assert.match(setRuntime, /createHash\("sha256"\)/);
  assert.match(setRuntime, /revision_number/);
  assert.match(setRuntime, /CREATIVE_CHAT_SHOT_SET_RANGE_OUT_OF_BOUNDS/);
  assert.match(setRuntime, /CREATIVE_CHAT_SHOT_SET_TOO_LARGE/);
  assert.match(setRuntime, /this scene/);
  assert.match(setRuntime, /sceneNumberFromReference/);
  assert.match(setRuntime, /CreativeChatShotReferenceRuntime\.resolve/);
  assert.match(planner, /media_generation_executed:\s*false/);
  assert.match(planner, /publish_authorized:\s*false/);
});

test("confirmed batch rejects stale fingerprints and Pro locks before atomic execution", () => {
  const staleIndex = executor.indexOf("CREATIVE_CHAT_MULTI_REVISION_PLAN_STALE");
  const lockIndex = executor.indexOf("plan.professional_lock_conflicts.length");
  const atomicIndex = executor.indexOf("CreativeAtomicShotSetRevisionRuntime.revise({");

  assert.ok(staleIndex >= 0, "stale-plan gate must exist");
  assert.ok(lockIndex >= 0, "professional-lock preflight must exist");
  assert.ok(atomicIndex >= 0, "atomic multi-shot execution must exist");
  assert.ok(staleIndex < atomicIndex, "stale plans must fail before atomic execution");
  assert.ok(lockIndex < atomicIndex, "Pro locks must fail before atomic execution");
  assert.match(executor, /current_plan_fingerprint/);
  assert.match(executor, /submitted_plan_fingerprint/);
  assert.doesNotMatch(executor, /CreativeChatShotRevisionRuntime\.revise/);
});

test("whole-set AI proposal is fully validated before the single database commit boundary", () => {
  assert.match(atomicRuntime, /AVANTIQO_ATOMIC_SHOT_SET_REVISION_V1/);
  assert.match(atomicRuntime, /ATOMIC_MULTI_SHOT_REVISION_V1/);
  assert.match(atomicRuntime, /CreativeProfessionalDirectionAuthorityRuntime\.stripLockedPatch/);
  assert.match(atomicRuntime, /expected_revision_number/);
  assert.match(atomicRuntime, /expected_updated_at/);

  const reasoningIndex = atomicRuntime.indexOf("ServiceExecutionRuntime.execute({");
  const validationIndex = atomicRuntime.indexOf("validateProposal({ output, scope, shots: verifiedShots })");
  const rpcIndex = atomicRuntime.indexOf('"creative_apply_shot_set_revision_atomic"');
  assert.ok(reasoningIndex >= 0);
  assert.ok(validationIndex > reasoningIndex, "whole-set output must validate after reasoning");
  assert.ok(rpcIndex > validationIndex, "database commit must happen only after full proposal validation");
});

test("Postgres boundary is all-or-nothing, scoped, stale-safe and checkpointed", () => {
  assert.match(migration, /creative_apply_shot_set_revision_atomic/);
  assert.match(migration, /SECURITY INVOKER/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /CREATIVE_ATOMIC_REVISION_STALE_REVISION/);
  assert.match(migration, /CREATIVE_ATOMIC_REVISION_STALE_UPDATED_AT/);
  assert.match(migration, /private\.creative_direction_checkpoints/);
  assert.match(migration, /before_state jsonb NOT NULL/);
  assert.match(migration, /after_state jsonb NOT NULL/);
  assert.match(migration, /REVOKE EXECUTE[^;]+FROM PUBLIC, anon, authenticated/s);
  assert.match(migration, /GRANT EXECUTE[^;]+TO service_role/s);
});

test("atomic execution canonically verifies the exact planned shots and never generates media", () => {
  const atomicIndex = executor.indexOf("CreativeAtomicShotSetRevisionRuntime.revise({");
  const rereadIndex = executor.indexOf("const canonicalProjectShots = await ShotRuntime.list({");
  assert.ok(atomicIndex >= 0);
  assert.ok(rereadIndex > atomicIndex, "canonical project reread must follow atomic commit");
  assert.match(executor, /CANONICAL_ATOMIC_MULTI_SHOT_REREAD/);
  assert.match(executor, /atomic_commit:\s*true/);
  assert.match(executor, /all_or_nothing:\s*true/);
  assert.match(executor, /checkpoint_id/);
  assert.match(executor, /reversible:\s*true/);
  assert.match(executor, /media_generation_executed:\s*false/);
  assert.match(executor, /publish_authorized:\s*false/);
});

test("undo uses one exact checkpoint and fails closed when newer work exists", () => {
  assert.match(restore, /CreativeAtomicShotSetRevisionRuntime\.restore/);
  assert.match(restore, /checkpoint_id/);
  assert.match(restore, /atomic_restore:\s*true/);
  assert.match(restore, /media_generation_executed:\s*false/);
  assert.match(restore, /publish_authorized:\s*false/);

  assert.match(migration, /creative_restore_shot_set_checkpoint_atomic/);
  assert.match(migration, /v_checkpoint\.status <> 'APPLIED'/);
  assert.match(migration, /CREATIVE_DIRECTION_CHECKPOINT_STALE/);
  assert.match(migration, /status = 'RESTORED'/);
});

test("Operator Creative context persists checkpoint identity and lifecycle, not undo authority", () => {
  assert.match(projectState, /"creative\.studio\.reviseShotSet"/);
  assert.match(projectState, /"creative\.studio\.restoreShotSetRevision"/);
  assert.match(projectState, /last_direction_checkpoint_id/);
  assert.match(projectState, /last_direction_checkpoint_status/);
  assert.match(projectState, /last_direction_plan_fingerprint/);
  assert.match(projectState, /isAtomicRevision \? "APPLIED" : isAtomicRestore \? "RESTORED"/);
  assert.match(projectState, /RESTORED\/SUPERSEDED must not be treated as reusable undo authority/);
});
