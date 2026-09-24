import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/operator/code/mission/route.js", import.meta.url), "utf8");

test("Talk follows the organization mission after reload without IDE session", () => {
  assert.match(ide, /!session\?\.session_id && embedded && studioView === "talk"/);
  assert.match(ide, /const currentActiveMissionId = missionRunning && localMissionId[\s\S]{0,220}: observedActiveMissionId/);
});

test("background terminal phases are distinct from inner slice completion", () => {
  assert.match(route, /LOCAL_BACKGROUND_MISSION_COMPLETED/);
  assert.match(route, /LOCAL_BACKGROUND_MISSION_TERMINAL/);
  assert.match(ide, /local_background_mission_\(completed\|terminal\)/);
});

test("terminal Talk handoff is deterministic and reload-safe", () => {
  assert.match(ide, /const summaryId = `mission-summary-\$\{missionId\}`/);
  assert.match(ide, /current\.some\(\(turn\) => turn\.id === summaryId\)/);
});

test("final verification failure overrides earlier passing evidence", () => {
  const start = ide.indexOf("const verificationText = failedVerification");
  assert.ok(start >= 0);
  const block = ide.slice(start, start + 600);
  assert.match(block, /failedVerification/);
  assert.match(block, /passedVerification/);
});
