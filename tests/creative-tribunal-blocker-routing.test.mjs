import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", import.meta.url), "utf8");

test("factual repair routing follows blocker evidence not reviewer title", () => {
  assert.match(source, /factual\|claim\|unverified\|verification\|metric\|percentage\|attribution\|external\|unsupported factual/);
  assert.match(source, /Remove unsupported quantified outcomes and externally checkable claims/);
});

test("problem-solution montage blockers get a dedicated bounded repair instruction", () => {
  assert.match(source, /problem\[- \]\?solution\|problem solution\|generic solution\|solution montage/);
  assert.match(source, /remove the generic problem-then-fix advertising structure/);
});

test("technical light and material blockers get physical-causality repair instruction", () => {
  assert.match(source, /light behavior\|neural light composition\|material/);
  assert.match(source, /every visible light, reflection, refraction, color or material change must have a plausible optical or material cause/);
});
