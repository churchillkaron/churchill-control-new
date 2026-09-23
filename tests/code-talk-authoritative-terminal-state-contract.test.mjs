import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/operator/code/mission/route.js", import.meta.url), "utf8");

test("Talk uses authoritative mission state rather than inner slice completion events", () => {
  assert.match(ide, /const authoritativeMissionState = text\(scopedProgress\?\.state_status\)\.toLowerCase\(\)/);
  assert.match(ide, /terminalMissionStates\.has\(authoritativeMissionState\)/);
  assert.match(ide, /!authoritativeMissionState && \/mission_completed/);
});

test("background worker publishes continuing state after every resumable slice", () => {
  assert.match(route, /phase: "LOCAL_BACKGROUND_CONTINUING"/);
  assert.match(route, /status: "running"/);
  assert.match(route, /continuing the same preserved mission into the next concrete step/);
});
