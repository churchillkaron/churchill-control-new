import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildReviewedMusicEditReference,
  normalizeReviewedMusicEditReference,
} from "../lib/creative/music/runtime/CreativeMusicReviewedEditReferenceRuntime.js";

function readyChangeSet() {
  return {
    execution_ready: true,
    creative_project_id: "music-project-1",
    master_asset_id: "master-v5",
    target_range: { start_seconds: 62, end_seconds: 81, label: "second chorus" },
    intended_delta: "Make the second chorus darker and less dense",
    allow_protected_overlap: false,
    change_set_fingerprint: "1234567890abcdef1234567890abcdef",
  };
}
test("reviewed Music edit reference is bounded and self-verifying", () => {
  const reference = buildReviewedMusicEditReference(readyChangeSet());
  assert.ok(reference);
  assert.equal(reference.creative_project_id, "music-project-1");
  assert.equal(reference.master_asset_id, "master-v5");
  assert.equal(reference.target_range.start_seconds, 62);
  assert.equal(reference.publication_authorized, false);
  assert.match(reference.reviewed_edit_reference_hash, /^[a-f0-9]{32}$/);
  const normalized = normalizeReviewedMusicEditReference(reference);
  assert.equal(normalized.valid, true);
});

test("reviewed Music edit reference detects payload tampering", () => {
  const reference = buildReviewedMusicEditReference(readyChangeSet());
  const tampered = { ...reference, intended_delta: "Replace the whole song" };
  const normalized = normalizeReviewedMusicEditReference(tampered);
  assert.equal(normalized.valid, false);
});
test("Business Partner planning returns exact reviewed-edit continuation", () => {
  const source = fs.readFileSync("lib/creative/music/capabilities/planWorldClassMusicStudio.js", "utf8");
  assert.match(source, /reviewed_edit_reference/);
  assert.match(source, /reviewed_edit_continuation/);
  assert.match(source, /creative\.music\.executeWorldClassProduction/);
  assert.match(source, /authorization_requirement: "user_confirmation"/);
  assert.match(source, /source_rights_confirmation_required: true/);
  assert.match(source, /expected_change_set_fingerprint: reviewedEditReference\.expected_change_set_fingerprint/);
  assert.match(source, /publication_authorized: false/);
});

test("reviewed reference is not produced for a blocked change set", () => {
  const reference = buildReviewedMusicEditReference({ ...readyChangeSet(), execution_ready: false });
  assert.equal(reference, null);
});
