import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const creativeRuntime = fs.readFileSync(
  "lib/creative/runtime/CreativeRuntime.js",
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
const chatRevisionRuntime = fs.readFileSync(
  "lib/creative/revisions/runtime/CreativeChatShotRevisionRuntime.js",
  "utf8",
);

test("Video Chat exposes canonical direction inspection and surgical revision", () => {
  assert.match(creativeRuntime, /inspectDirection:\s*\(\)\s*=>/);
  assert.match(creativeRuntime, /inspectStudioDirection/);
  assert.match(creativeRuntime, /reviseShot:\s*\(\)\s*=>/);
  assert.match(creativeRuntime, /reviseStudioShot/);
});

test("direction inspection is read-only and surfaces human-authority locks", () => {
  assert.match(inspector, /action:\s*"inspectDirection"/);
  assert.match(inspector, /operatorMode:\s*"read"/);
  assert.match(inspector, /operatorAutoExecute:\s*true/);
  assert.match(inspector, /operatorRequiresConfirmation:\s*false/);
  assert.match(inspector, /CreativeProfessionalDirectionAuthorityRuntime\.lockedFields/);
  assert.match(inspector, /media_generation_executed:\s*false/);
  assert.match(inspector, /publish_authorized:\s*false/);
});

test("chat shot revision requires explicit confirmation and never generates media", () => {
  assert.match(revisionCapability, /action:\s*"reviseShot"/);
  assert.match(revisionCapability, /operatorMode:\s*"write"/);
  assert.match(revisionCapability, /operatorAutoExecute:\s*false/);
  assert.match(revisionCapability, /operatorRequiresConfirmation:\s*true/);
  assert.match(revisionCapability, /boundary:\s*"conversation_confirmation"/);
  assert.match(revisionCapability, /media_generation_executed:\s*false/);
  assert.match(revisionCapability, /publish_authorized:\s*false/);
});

test("chat revision fails closed on Pro Studio field locks before AI surgical revision", () => {
  assert.match(chatRevisionRuntime, /CREATIVE_CHAT_REVISION_PROFESSIONAL_LOCKED/);
  assert.match(chatRevisionRuntime, /CreativeProfessionalDirectionAuthorityRuntime\.lockedFields/);

  const lockIndex = chatRevisionRuntime.indexOf("const conflicts = lockConflicts(target, scope)");
  const revisionIndex = chatRevisionRuntime.indexOf("CreativeShotSurgicalRevisionRuntime.revise({");
  assert.ok(lockIndex >= 0, "professional lock gate must exist");
  assert.ok(revisionIndex >= 0, "surgical revision invocation must exist");
  assert.ok(
    lockIndex < revisionIndex,
    "professional human-authority locks must be checked before AI revision executes",
  );
});

test("chat direction scope stays bounded to professional filmmaking controls", () => {
  for (const scope of ["camera", "coverage", "continuity", "performance", "edit"]) {
    assert.match(chatRevisionRuntime, new RegExp(`"${scope}"`));
  }
  assert.doesNotMatch(chatRevisionRuntime, /generation\s*[,)]/i);
  assert.match(chatRevisionRuntime, /professional_locks_preserved:\s*true/);
});
