import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const work = await readFile(new URL("../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/operator/code/mission/route.js", import.meta.url), "utf8");
const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");

test("pre-planner governance checks have a hard deadline", () => {
  assert.match(work, /CONTROL_PLANE_CHECK_TIMEOUT_MS = 3500/);
  assert.match(work, /boundedControlPlaneCheck\("LIVE_EXECUTION_STOP"/);
  assert.match(work, /boundedControlPlaneCheck\("OWNER_STOP_BOUNDARY"/);
  assert.match(work, /CODE_AI_CONTROL_PLANE_CHECK_TIMEOUT/);
});

test("background worker retries the same safe boundary during transient control-plane outages", () => {
  assert.match(route, /maxControlPlaneRecoveryAttempts = 6/);
  assert.match(route, /LOCAL_BACKGROUND_CONTROL_PLANE_RECOVERY/);
  assert.match(route, /CODE_AI_CONTROL_PLANE_\(\?:CHECK_TIMEOUT\|TEMPORARILY_UNAVAILABLE\)/);
  assert.match(route, /Math\.min\(8000, 750 \* \(2 \*\* Math\.max/);
});

test("customer-facing Talk never exposes raw control-plane codes", () => {
  assert.match(ide, /Code’s mission-control connection is temporarily unavailable/);
  assert.match(ide, /CODE_AI_CONTROL_PLANE_CHECK_TIMEOUT/);
  assert.match(ide, /CODE_AI_CONTROL_PLANE_TEMPORARILY_UNAVAILABLE/);
});
