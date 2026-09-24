import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { explicitCodeAIReadOnlyPaths } from "../lib/code/runtime/CodeAIReadOnlyInspectionRuntime.js";

const source = fs.readFileSync(
  new URL("../lib/code/runtime/CodeAIReadOnlyInspectionRuntime.js", import.meta.url),
  "utf8",
);

test("read-only inspection extracts exact owner-named repository paths", () => {
  assert.deepEqual(explicitCodeAIReadOnlyPaths(
    "Inspect app/api/operator/code/mission/route.js and components/creative/code/AvantiqoCodeIDE.jsx. Do not modify files.",
  ), [
    "app/api/operator/code/mission/route.js",
    "components/creative/code/AvantiqoCodeIDE.jsx",
  ]);
});

test("exact owner paths bypass broad domain inventory", () => {
  assert.match(source, /const groups = explicitPaths\.length \? \[\] : \[/);
  assert.match(source, /const groupedPaths = \[\.\.\.explicitPaths\]/);
  assert.match(source, /const selected = explicitPaths\.length/);
});
