import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const source = fs.readFileSync(
  "scripts/creative-direction-approval.mjs",
  "utf8",
);

test("direction approval accepts an exact externally supplied approval phrase", () => {
  assert.match(source, /CREATIVE_DIRECTION_APPROVAL_RESPONSE/);
  assert.match(source, /normalized\(suppliedApproval\) === normalized\(phrase\)/);
});

test("fresh direction approval binds command identity to project metadata", () => {
  assert.match(source, /command_identity: identity,\n\s*paid_direction_approval: approval/);
});
