import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { mergeCreativeRepairedPlan } from "../lib/creative/director/runtime/mergeCreativeRepairedPlan.js";

const council = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeConceptCouncilRuntime.js", import.meta.url),
  "utf8",
);
const master = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeMasterPlanRuntime.js", import.meta.url),
  "utf8",
);

test("master transport merges partial top-level role repairs into the embedded complete map", () => {
  assert.match(master, /const roleDecisions = \{\s*\.\.\.embedded,\s*\.\.\.separate,/s);
});

test("recovered structurally stale Council revision gets one fresh retry", () => {
  assert.match(council, /let recoveredRevision = revision != null/);
  assert.match(council, /if \(!recoveredRevision \|\| !structuralMismatch\) throw error/);
  assert.match(council, /revision = await runRevision\(\);\s*recoveredRevision = false;/s);
});
