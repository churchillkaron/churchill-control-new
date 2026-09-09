import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  "lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js",
  "utf8",
);

test("repair prompt requires canonical role decision objects", () => {
  assert.match(source, /Use the canonical property name "decision"/);
  assert.match(source, /role_decisions values MUST be full objects/);
  assert.match(source, /Never return a scalar string such as "ACTIVE"/);
});

test("repair prompt requires literal stable id keys", () => {
  assert.match(source, /Use the literal key "id" for scene and shot identity/);
  assert.match(source, /Do NOT use scene_id, shot_id/);
});

test("repair prompt preserves film master output spec", () => {
  assert.match(source, /MASTER OUTPUT SPEC/);
  assert.match(
    source,
    /source\/reference image's dimensions are never the film output specification/i,
  );
  assert.match(source, /Do not invent claims about safety procedures/);
});
