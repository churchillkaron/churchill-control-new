import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../app/api/operator/code/mission/route.js", import.meta.url), "utf8");
const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");
const background = await readFile(new URL("../lib/code/runtime/CodeStudioLocalMissionBackgroundRuntime.js", import.meta.url), "utf8");

test("local DEVICE mission starts background worker and returns accepted immediately", () => {
  assert.match(route, /requestedWorkspaceTarget === "DEVICE"/);
  assert.match(route, /startCodeStudioLocalMissionBackground/);
  assert.match(route, /status: "accepted"/);
  assert.match(route, /async_running: true/);
  const deviceBranch = route.slice(route.indexOf('if (\n      requestedWorkspaceTarget === "DEVICE"'));
  const oldVerification = deviceBranch.indexOf("const developerVerification");
  const ack = deviceBranch.indexOf("return Response.json({");
  assert.ok(ack >= 0 && oldVerification > ack, "DEVICE must return before synchronous developer branches");
});

test("background local worker owns bounded capability slices and continuation tranches", () => {
  assert.match(route, /runLocalDeviceMissionBackground/);
  assert.match(route, /timeout_ms: 30000/);
  assert.match(route, /REASONING_TRANCHE_CONTINUATION/);
  assert.match(route, /LOCAL_BACKGROUND_PASS/);
  assert.match(route, /freshRealProgress/);
  assert.match(route, /waiting for the next concrete repository event/);
});

test("browser consumes shared progress instead of opening a second progress poller", () => {
  assert.match(ide, /body\?\.async_running === true/);
  assert.match(ide, /const liveProgress = scopedProgressRef\.current/);
  const asyncBlock = ide.slice(ide.indexOf("if (body?.async_running === true)"), ide.indexOf("setMissionResult(body); requestRefresh();", ide.indexOf("if (body?.async_running === true)")));
  assert.doesNotMatch(asyncBlock, /fetch\(\s*`\/api\/operator\/code\/progress/);
});

test("background registry deduplicates one local mission per organization", () => {
  assert.match(background, /Symbol\.for\("avantiqo\.codeStudio\.localMissionBackgroundRegistry"\)/);
  assert.match(background, /already_running: true/);
  assert.match(background, /entry\.running = false/);
});
