import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const referenceRuntime = fs.readFileSync(
  "lib/creative/studio/runtime/CreativeChatShotReferenceRuntime.js",
  "utf8",
);
const inspector = fs.readFileSync(
  "lib/creative/studio/capabilities/inspectStudioDirection.js",
  "utf8",
);
const revisionCapability = fs.readFileSync(
  "lib/creative/studio/capabilities/reviseStudioShot.js",
  "utf8",
);
const projectState = fs.readFileSync(
  "lib/operator/contracts/OperatorProjectState.js",
  "utf8",
);

test("chat shot references resolve server-side, never by prompt guessing", () => {
  assert.match(referenceRuntime, /AVANTIQO_CHAT_SHOT_REFERENCE_V1/);
  assert.match(referenceRuntime, /ShotRuntime\.list/);
  assert.match(referenceRuntime, /CREATIVE_CHAT_SHOT_REFERENCE_AMBIGUOUS/);
  assert.match(referenceRuntime, /CREATIVE_CHAT_SHOT_REFERENCE_ANCHOR_REQUIRED/);
  assert.match(referenceRuntime, /CREATIVE_CHAT_SHOT_REFERENCE_NUMBER_AMBIGUOUS/);
  assert.match(referenceRuntime, /Choose one candidate explicitly/);
});

test("only truly relative references require a verified active-shot anchor", () => {
  for (const phrase of ["this shot", "previous shot", "next shot"]) {
    assert.match(referenceRuntime, new RegExp(`"${phrase}"`));
  }

  const nonRelativeExit = referenceRuntime.indexOf(
    "if (!isCurrent && !isPrevious && !isNext) return null;",
  );
  const anchorLookup = referenceRuntime.indexOf(
    "const anchorIndex = shots.findIndex(",
    nonRelativeExit,
  );
  assert.ok(nonRelativeExit >= 0, "non-relative references must exit relative resolution");
  assert.ok(anchorLookup > nonRelativeExit, "anchor lookup must occur only after confirming a relative phrase");

  assert.match(referenceRuntime, /anchor_shot_id/);
  assert.match(inspector, /anchor_shot_id/);
  assert.match(revisionCapability, /anchor_shot_id/);
});

test("scene and shot numbers have an exact deterministic addressing path", () => {
  assert.match(referenceRuntime, /function sceneShotNumber/);
  assert.match(referenceRuntime, /scene_number:\s*Number\(match\[1\]\)/);
  assert.match(referenceRuntime, /shot_number:\s*Number\(match\[2\]\)/);
  assert.match(referenceRuntime, /resolution:\s*"SCENE_SHOT_NUMBER"/);
  assert.match(referenceRuntime, /CREATIVE_CHAT_SHOT_REFERENCE_SCENE_SHOT_AMBIGUOUS/);
  assert.match(referenceRuntime, /CREATIVE_CHAT_SHOT_REFERENCE_SCENE_SHOT_NOT_FOUND/);
});

test("inspection and revision share the same canonical reference runtime", () => {
  assert.match(inspector, /CreativeChatShotReferenceRuntime\.resolve/);
  assert.match(revisionCapability, /CreativeChatShotReferenceRuntime\.resolve/);
  assert.match(inspector, /shot_reference/);
  assert.match(revisionCapability, /shot_reference/);
});

test("confirmed single-shot revision re-reads canonical direction before returning success", () => {
  const revisionIndex = revisionCapability.indexOf(
    "CreativeChatShotRevisionRuntime.revise({",
  );
  const rereadIndex = revisionCapability.indexOf(
    "ShotRuntime.get(reference.shot.id)",
  );
  assert.ok(revisionIndex >= 0, "revision execution must exist");
  assert.ok(rereadIndex >= 0, "canonical re-inspection must exist");
  assert.ok(
    revisionIndex < rereadIndex,
    "canonical direction must be re-read after the revision",
  );
  assert.match(revisionCapability, /source:\s*"CANONICAL_SHOT_REREAD"/);
  assert.match(revisionCapability, /verified_direction/);
  assert.match(revisionCapability, /media_generation_executed:\s*false/);
  assert.match(revisionCapability, /publish_authorized:\s*false/);
});

test("operator continuity persists only verified Creative shot identity", () => {
  assert.match(projectState, /"creative\.studio\.inspectDirection"/);
  assert.match(projectState, /"creative\.studio\.reviseShot"/);
  assert.match(projectState, /active_shot_id/);
  assert.match(projectState, /active_scene_id/);
  assert.match(projectState, /active_shot_number/);
  assert.match(projectState, /active_shot_title/);
  assert.match(projectState, /active_revision_number/);
  assert.match(projectState, /Server-verified continuity only/);
});
