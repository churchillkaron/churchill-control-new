import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js", "utf8");

test("temporal contract repair is bound to stable scene and shot ids", () => {
  assert.match(source, /STABLE STRUCTURE IDS/);
  assert.match(source, /Every scene patch MUST copy an exact scene id/);
  assert.match(source, /Every shot patch MUST copy an exact shot id/);
  assert.match(source, /scenes MUST be a JSON array/);
  assert.match(source, /shots MUST be a JSON array/);
});

test("temporal contract repair keeps applicable film disciplines active", () => {
  assert.match(source, /APPLICABLE TEMPORAL ROLES/);
  assert.match(source, /MUST be ACTIVE/);
  assert.match(source, /Never mark an applicable film discipline NOT_REQUIRED/);
});

test("temporal contract repair preserves grounded subject and typed shot fields", () => {
  assert.match(source, /Do not weaken researched subject\/location grounding/);
  assert.match(source, /negative_constraints, known_failure_modes and repair_instructions MUST be JSON arrays/);
  assert.match(source, /generation\.required must be boolean true/);
  assert.match(source, /energy_level must be numeric 0-100/);
});
