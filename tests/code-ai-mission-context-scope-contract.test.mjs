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

const missionRuntime = await readFile(new URL("../lib/code/runtime/CodeAIMissionRuntime.js", import.meta.url), "utf8");

test("mission slices preserve bounded objective context across repository operations", () => {
  assert.match(missionRuntime, /objective_context: object\(prior\.objective_context\)/);
  assert.match(missionRuntime, /allowed_edit_paths/);
  assert.match(missionRuntime, /declaredExpectedCreateTarget/);
});

test("initial repository inspection receives objective context before any read operation", () => {
  const liveRuntimePath = new URL("../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", import.meta.url);
  return readFile(liveRuntimePath, "utf8").then((liveRuntime) => {
    assert.match(missionRuntime, /objective_context = null/);
    assert.match(missionRuntime, /\.\.\.object\(objective_context\)/);
    assert.match(liveRuntime, /objective_context: normalizedContext/);
  });
});
