import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");

test("live planner and reasoning phases preserve concrete backend descriptions", () => {
  assert.match(ide, /planner_pending\|planning\|reasoning\|work_package\|local_background_pass\|reasoning_tranche_continuation/);
  assert.match(ide, /if \(customerSafeDescription\) return customerSafeDescription/);
  assert.doesNotMatch(ide, /owned code model\|reasoning\|planner\|work package\|engineering package\|provider\|attestation\|CODE_/);
});

test("terminal planner/reasoning blockers preserve state without exposing raw internal budget codes", () => {
  assert.match(ide, /Code reached the end of its bounded local planning tranche before it produced the next repository step/);
  assert.match(ide, /current repository changes, completed operations, and mission state are preserved/);
  assert.doesNotMatch(ide, /I’m still working out the safest next move from what I’ve already inspected\. I haven’t changed the code yet/);
});
