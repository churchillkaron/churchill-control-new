import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../app/api/operator/code/mission/route.js", import.meta.url), "utf8");
const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");
const runner = await readFile(new URL("../lib/code/runtime/CodeStudioLocalMissionBackgroundRuntime.js", import.meta.url), "utf8");

test("local DEVICE missions hand execution to a background runner and ACK immediately", () => {
  const deviceBranch = route.indexOf('requestedWorkspaceTarget === "DEVICE"');
  const developerVerification = route.indexOf("const developerVerification = resolveCodeAIDeveloperVerificationRequest");
  assert.ok(deviceBranch >= 0 && developerVerification > deviceBranch);
  const localSection = route.slice(deviceBranch, developerVerification);
  assert.match(localSection, /startCodeStudioLocalMissionBackground/);
  assert.match(localSection, /status: "accepted"/);
  assert.match(localSection, /async_running: true/);
  assert.match(localSection, /already_running/);
});

test("background runner owns bounded mission slices and local continuation", () => {
  assert.match(route, /async function runLocalDeviceMissionBackground/);
  assert.match(route, /timeout_ms: 30000/);
  assert.match(route, /REASONING_TRANCHE_CONTINUATION/);
  assert.match(route, /LOCAL_BACKGROUND_PASS/);
  assert.match(route, /startCodeStudioLocalMissionBackground/);
});

test("one in-process background worker owns each local mission", () => {
  assert.match(runner, /Symbol\.for\("avantiqo\.codeStudio\.localMissionBackgroundRegistry"\)/);
  assert.match(runner, /already_running: true/);
  assert.match(runner, /registry\(\)\.set\(key, entry\)/);
});

test("browser treats async ACK as worker ownership and watches progress only", () => {
  assert.match(ide, /if \(body\?\.async_running === true\)/);
  assert.match(ide, /The local Code employee owns this mission now/);
  assert.match(ide, /useCodeProgressFeed/);
  assert.match(ide, /No fresh worker event arrived yet\. I’m refreshing the authoritative mission state/);
  assert.match(ide, /Code background mission stalled without authoritative progress/);
  assert.match(ide, /terminalProgress/);
});
