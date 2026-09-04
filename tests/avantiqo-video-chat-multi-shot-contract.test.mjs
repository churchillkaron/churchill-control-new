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
const checkpointLookupMigration = fs.readFileSync(
  "supabase/migrations/20260904053000_creative_direction_checkpoint_lookup.sql",
  "utf8",
);
const preservedGuardMigration = fs.readFileSync(
  "supabase/migrations/20260904053500_creative_guarded_preserved_shots.sql",
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

test("shot-set planning is deterministic, bounded and preservation-aware before any write", () => {
  assert.match(setRuntime, /AVANTIQO_CHAT_SHOT_SET_V5/);
  assert.match(setRuntime, /createHash\("sha256"\)/);
  assert.match(setRuntime, /revision_number/);
  assert.match(setRuntime, /updated_at/);
  assert.match(setRuntime, /CREATIVE_CHAT_SHOT_SET_RANGE_OUT_OF_BOUNDS/);
  assert.match(setRuntime, /CREATIVE_CHAT_SHOT_SET_TOO_LARGE/);
  assert.match(setRuntime, /CREATIVE_CHAT_SHOT_SET_CONTEXT_TOO_LARGE/);
  assert.match(setRuntime, /governedShotCount = selected\.length \+ preserved\.length/);
  assert.match(setRuntime, /preserved shots still consume immutable reasoning context/);
  assert.match(setRuntime, /this scene/);
  assert.match(setRuntime, /sceneNumberFromReference/);
  assert.match(setRuntime, /CreativeChatShotReferenceRuntime\.resolve/);
  assert.match(setRuntime, /splitInlinePreservation/);
  assert.match(setRuntime, /except\|excluding\|but\\s\+not\|leave\|keep/);
  assert.match(setRuntime, /exclude_shot_ids/);
  assert.match(setRuntime, /exclude_shot_references/);
  assert.match(setRuntime, /preserved_shots/);
  assert.match(setRuntime, /CREATIVE_CHAT_SHOT_SET_PRESERVATION_OUTSIDE_SELECTION/);
  assert.match(setRuntime, /CREATIVE_CHAT_SHOT_SET_ALL_SHOTS_PRESERVED/);
  assert.match(planner, /preserved_shot_count/);
  assert.match(planner, /media_generation_executed:\s*false/);
  assert.match(planner, /publish_authorized:\s*false/);
});

test("plan fingerprint includes both revision and timestamp freshness for editable and preserved shots", () => {
  const fingerprintIndex = setRuntime.indexOf("function fingerprint({");
  const editableIndex = setRuntime.indexOf("shots: shots.map((shot) => ({", fingerprintIndex);
  const preservedIndex = setRuntime.indexOf("preserved_shots: preserved_shots.map((shot) => ({", fingerprintIndex);
  assert.ok(fingerprintIndex >= 0);
  assert.ok(editableIndex > fingerprintIndex);
  assert.ok(preservedIndex > editableIndex);

  const editableBlock = setRuntime.slice(editableIndex, preservedIndex);
  const preservedBlock = setRuntime.slice(preservedIndex, preservedIndex + 420);
  for (const block of [editableBlock, preservedBlock]) {
    assert.match(block, /shot_id:/);
    assert.match(block, /revision_number:/);
    assert.match(block, /updated_at:/);
  }
});

test("scene-qualified shot ranges take precedence over project ordinals and fail closed", () => {
  assert.match(setRuntime, /function sceneRangeFromReference/);
  assert.match(setRuntime, /SCENE_SHOT_RANGE/);
  assert.match(setRuntime, /CREATIVE_CHAT_SHOT_SET_SCENE_RANGE_SCENE_NOT_FOUND/);
  assert.match(setRuntime, /CREATIVE_CHAT_SHOT_SET_SCENE_RANGE_SHOT_NOT_FOUND/);
  assert.match(setRuntime, /CREATIVE_CHAT_SHOT_SET_SCENE_RANGE_SHOT_AMBIGUOUS/);
  assert.match(setRuntime, /CREATIVE_CHAT_SHOT_SET_EXCLUDED_SCENE_RANGE_SHOT_NOT_FOUND/);
  const sceneRangeIndex = setRuntime.indexOf("const sceneRange = sceneRangeFromReference(setReference)");
  const projectRangeIndex = setRuntime.indexOf("const range = rangeFromReference(setReference)");
  assert.ok(sceneRangeIndex >= 0, "scene-qualified range parser must exist");
  assert.ok(projectRangeIndex > sceneRangeIndex, "scene-qualified ranges must resolve before project ranges");
  assert.match(setRuntime, /if \(\/\\bscene\\s\*#\?\\s\*\\d\{1,4\}\\b\/i\.test\(value\)\) return null/);
});

test("anchored relative shot sets are exact, bounded and preservation-aware", () => {
  assert.match(setRuntime, /function relativeWindowFromReference/);
  assert.match(setRuntime, /function relativeWindowShots/);
  assert.match(setRuntime, /NUMBER_WORDS/);
  assert.match(setRuntime, /CREATIVE_CHAT_SHOT_SET_RELATIVE_WINDOW/);
  assert.match(setRuntime, /CREATIVE_CHAT_SHOT_SET_EXCLUDED_RELATIVE_WINDOW/);
  assert.match(setRuntime, /_ANCHOR_REQUIRED/);
  assert.match(setRuntime, /_OUT_OF_BOUNDS/);
  assert.match(setRuntime, /Avantiqo will not silently truncate a directing set/);
  assert.match(setRuntime, /include_anchor:\s*true/);
  assert.match(setRuntime, /include_anchor:\s*false/);
  const relativeIndex = setRuntime.indexOf("const relativeWindow = relativeWindowFromReference(setReference)");
  const sceneIndex = setRuntime.indexOf("const sceneRange = sceneRangeFromReference(setReference)");
  assert.ok(relativeIndex >= 0, "relative set parser must exist");
  assert.ok(sceneIndex > relativeIndex, "relative sets must resolve before generic range/reference fallback");
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
  assert.match(executor, /preserved_shots:\s*plan\.preserved_shots/);
  assert.doesNotMatch(executor, /CreativeChatShotRevisionRuntime\.revise/);
});

test("whole-set AI proposal treats preserved shots as immutable context and validates before commit", () => {
  assert.match(atomicRuntime, /AVANTIQO_ATOMIC_SHOT_SET_REVISION_V2/);
  assert.match(atomicRuntime, /ATOMIC_MULTI_SHOT_REVISION_V2/);
  assert.match(atomicRuntime, /PRESERVED IMMUTABLE SHOTS/);
  assert.match(atomicRuntime, /CREATIVE_ATOMIC_MULTI_REVISION_PRESERVED_SHOT_PROPOSED/);
  assert.match(atomicRuntime, /CREATIVE_ATOMIC_MULTI_REVISION_PRESERVED_OVERLAP/);
  assert.match(atomicRuntime, /CreativeProfessionalDirectionAuthorityRuntime\.stripLockedPatch/);
  assert.match(atomicRuntime, /expected_revision_number/);
  assert.match(atomicRuntime, /expected_updated_at/);

  const reasoningIndex = atomicRuntime.indexOf("ServiceExecutionRuntime.execute({");
  const validationIndex = atomicRuntime.indexOf("const changes = validateProposal({");
  const rpcIndex = atomicRuntime.indexOf('"creative_apply_guarded_shot_set_revision_atomic"');
  assert.ok(reasoningIndex >= 0);
  assert.ok(validationIndex > reasoningIndex, "whole-set output must validate after reasoning");
  assert.ok(rpcIndex > validationIndex, "database commit must happen only after full proposal validation");
});

test("Postgres editable-shot boundary is all-or-nothing, scoped, stale-safe and checkpointed", () => {
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

test("preserved shots are locked and stale-checked inside the same transaction before editable writes", () => {
  assert.match(preservedGuardMigration, /creative_apply_guarded_shot_set_revision_atomic/);
  assert.match(preservedGuardMigration, /p_preserved_guards jsonb/);
  assert.match(preservedGuardMigration, /pg_advisory_xact_lock/);
  assert.match(preservedGuardMigration, /FOR UPDATE/);
  assert.match(preservedGuardMigration, /CREATIVE_ATOMIC_PRESERVED_SHOT_STALE_REVISION/);
  assert.match(preservedGuardMigration, /CREATIVE_ATOMIC_PRESERVED_SHOT_STALE_UPDATED_AT/);
  const staleGuardIndex = preservedGuardMigration.indexOf("CREATIVE_ATOMIC_PRESERVED_SHOT_STALE_UPDATED_AT");
  const delegateIndex = preservedGuardMigration.indexOf("creative_apply_shot_set_revision_atomic(");
  assert.ok(staleGuardIndex >= 0);
  assert.ok(delegateIndex > staleGuardIndex, "preserved stale checks must complete before editable mutation function runs");
  assert.match(preservedGuardMigration, /REVOKE EXECUTE[^;]+FROM PUBLIC, anon, authenticated/s);
  assert.match(preservedGuardMigration, /GRANT EXECUTE[^;]+TO service_role/s);
  assert.match(atomicRuntime, /p_preserved_guards:\s*preservedGuards\(preservedShots\)/);
});

test("atomic execution canonically verifies edited and preserved shots and never generates media", () => {
  const atomicIndex = executor.indexOf("CreativeAtomicShotSetRevisionRuntime.revise({");
  const rereadIndex = executor.indexOf("const canonicalProjectShots = await ShotRuntime.list({");
  assert.ok(atomicIndex >= 0);
  assert.ok(rereadIndex > atomicIndex, "canonical project reread must follow atomic commit");
  assert.match(executor, /CANONICAL_ATOMIC_MULTI_SHOT_REREAD/);
  assert.match(executor, /CREATIVE_CHAT_MULTI_REVISION_PRESERVED_SHOT_CHANGED/);
  assert.match(executor, /preserved_shots_unchanged:\s*true/);
  assert.match(executor, /atomic_commit:\s*true/);
  assert.match(executor, /all_or_nothing:\s*true/);
  assert.match(executor, /checkpoint_id/);
  assert.match(executor, /reversible:\s*true/);
  assert.match(executor, /media_generation_executed:\s*false/);
  assert.match(executor, /publish_authorized:\s*false/);
});

test("checkpoint lookup is exact, organization-scoped and service-role-only", () => {
  assert.match(
    atomicRuntime,
    /"creative_direction_checkpoint_shot_ids"/,
  );
  assert.match(checkpointLookupMigration, /creative_direction_checkpoint_shot_ids/);
  assert.match(checkpointLookupMigration, /SECURITY INVOKER/);
  assert.match(checkpointLookupMigration, /checkpoint\.organization_id = p_organization_id/);
  assert.match(checkpointLookupMigration, /checkpoint\.creative_project_id = p_creative_project_id/);
  assert.match(checkpointLookupMigration, /checkpoint\.status = 'APPLIED'/);
  assert.match(
    checkpointLookupMigration,
    /REVOKE EXECUTE[^;]+FROM PUBLIC, anon, authenticated/s,
  );
  assert.match(
    checkpointLookupMigration,
    /GRANT EXECUTE[^;]+TO service_role/s,
  );
});

test("undo uses one exact checkpoint, reanchors to its canonical restored shots and fails closed on newer work", () => {
  assert.match(restore, /CreativeAtomicShotSetRevisionRuntime\.restore/);
  assert.match(restore, /checkpoint_shot_ids/);
  assert.match(restore, /CREATIVE_DIRECTION_CHECKPOINT_SHOT_SET_MISSING/);
  assert.match(restore, /CREATIVE_DIRECTION_CHECKPOINT_REREAD_INCOMPLETE/);
  assert.match(restore, /restoredShots\.find/);
  assert.match(restore, /CANONICAL_CHECKPOINT_SHOT_SET_REREAD/);
  assert.match(restore, /restored_shots:\s*restoredShots/);
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
