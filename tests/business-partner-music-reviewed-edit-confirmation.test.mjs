import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildReviewedMusicEditReference } from "../lib/creative/music/runtime/CreativeMusicReviewedEditReferenceRuntime.js";
import { validateReviewedMusicEditContinuation } from "../lib/creative/music/runtime/CreativeMusicReviewedEditContinuationRuntime.js";

function fixture() {
  const reference = buildReviewedMusicEditReference({
    execution_ready: true,
    creative_project_id: "music-project-1",
    master_asset_id: "master-v7",
    target_range: { start_seconds: 42, end_seconds: 58, label: "second chorus" },
    intended_delta: "make the second chorus darker",
    allow_protected_overlap: false,
    change_set_fingerprint: "change-fingerprint-7",
  });
  const continuation = {
    capability_key: "creative.music.executeWorldClassProduction",
    authorization_requirement: "user_confirmation",
    source_rights_confirmation_required: true,
    publication_authorized: false,
    payload: {
      creative_project_id: reference.creative_project_id,
      master_asset_id: reference.master_asset_id,
      expected_change_set_fingerprint: reference.expected_change_set_fingerprint,
      target_range: reference.target_range,
      intended_delta: reference.intended_delta,
      allow_protected_overlap: reference.allow_protected_overlap,
    },
  };
  return { reference, continuation };
}

test("exact reviewed Music continuation passes fail-closed validation", () => {
  const { reference, continuation } = fixture();
  const result = validateReviewedMusicEditContinuation(reference, continuation);
  assert.equal(result.valid, true);
  assert.equal(result.payload.master_asset_id, "master-v7");
  assert.equal(result.rights_confirmation_required, true);
  assert.equal(result.publication_authorized, false);
});

test("tampered reviewed Music continuation is rejected", () => {
  const { reference, continuation } = fixture();
  assert.equal(validateReviewedMusicEditContinuation(reference, {
    ...continuation,
    payload: { ...continuation.payload, master_asset_id: "master-v8" },
  }).valid, false);
  assert.equal(validateReviewedMusicEditContinuation(reference, {
    ...continuation,
    payload: { ...continuation.payload, target_range: { start_seconds: 43, end_seconds: 58 } },
  }).valid, false);
  assert.equal(validateReviewedMusicEditContinuation(reference, {
    ...continuation,
    capability_key: "creative.music.planWorldClassProduction",
  }).valid, false);
  assert.equal(validateReviewedMusicEditContinuation(reference, {
    ...continuation,
    source_rights_confirmation_required: false,
  }).valid, false);
});

const operatorSource = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");

test("Business Partner binds reviewed Music edit to existing pending-confirmation machinery", () => {
  assert.match(operatorSource, /musicReviewedEditFollowUp/);
  assert.match(operatorSource, /validateReviewedMusicEditContinuation/);
  assert.match(operatorSource, /agreementWithPendingConfirmationRun/);
  assert.match(operatorSource, /MUSIC_REVIEWED_EDIT_CONFIRMATION_CONTRACT/);
  assert.match(operatorSource, /rights_attestation_pending/);
  assert.match(operatorSource, /confirmation_question/);
});

test("Music reviewed edit remains pending until affirmative confirmation", () => {
  assert.match(operatorSource, /reviewed_edit_pending_confirmation/);
  assert.match(operatorSource, /musicReviewedFollowUp \? "plan"/);
  assert.match(operatorSource, /clarification: musicReviewedFollowUp/);
  assert.match(operatorSource, /Yes, I confirm and want to proceed/);
  assert.match(operatorSource, /No, cancel/);
});
