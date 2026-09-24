import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");

test("engineering mission objectives exclude unrelated visual artifacts unless latest instruction is visual", () => {
  assert.match(ide, /const visualContextRequested = \/\\b\(\?:design\|visual\|ui\|ux\|layout\|style\|brand\|image\|poster\|hero\|preview\|wireframe\|mockup\)\\b\/i/);
  assert.match(ide, /visualContextRequested && turn\.role === "design_preview"/);
  assert.match(ide, /visualContextRequested && turn\.role === "visual"/);
  assert.match(ide, /visualContextRequested && turn\.role === "image"/);
  assert.match(ide, /Relevant recent engineering conversation/);
});
