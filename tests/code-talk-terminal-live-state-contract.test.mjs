import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");

test("terminal mission state overrides stale running events", () => {
  assert.match(ide, /const terminalStates = new Set\(\["blocked", "completed", "failed", "stopped", "cancelled", "repair_required", "replan_required"\]\)/);
  assert.match(ide, /if \(terminalStates\.has\(state\)\) return false/);
});
