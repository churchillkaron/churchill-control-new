import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");

test("terminal blocked failed stopped and cancelled missions require explicit owner continuation before reuse", () => {
  const sets = [...ide.matchAll(/const preservedTerminalStates = new Set\(\[([\s\S]*?)\]\);/g)];
  assert.equal(sets.length, 2);
  for (const match of sets) {
    assert.doesNotMatch(match[1], /"blocked"|"failed"|"stopped"|"cancelled"/);
    assert.match(match[1], /"repair_required"/);
    assert.match(match[1], /"replan_required"/);
    assert.match(match[1], /"verification_required"/);
  }
  assert.match(ide, /explicitMissionContinuation = \/\\b\(\?:continue\|resume\|replan\|same mission\|preserved mission\|keep going\|restart recovery\)\\b/);
});
