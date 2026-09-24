import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const mission = await readFile(new URL("../app/api/operator/code/mission/route.js", import.meta.url), "utf8");
const progress = await readFile(new URL("../app/api/operator/code/progress/route.js", import.meta.url), "utf8");

test("heartbeat cannot publish after a bounded pass settles", () => {
  assert.match(mission, /let passSettled = false/);
  assert.match(mission, /if \(passSettled\) return/);
  assert.match(mission, /passSettled = true;\s*const nextState/);
  assert.match(mission, /finally \{\s*passSettled = true;\s*if \(heartbeatTimer\) clearInterval\(heartbeatTimer\)/);
});

test("progress API reconciles stale running cache with background terminal outcome", () => {
  assert.match(progress, /codeStudioLocalMissionBackgroundStatus/);
  assert.match(progress, /background\?\.running === false/);
  assert.match(progress, /activeStatuses\.has\(progressStatus\)/);
  assert.match(progress, /state_status: backgroundStatus/);
  assert.match(progress, /MISSION_COMPLETED/);
  assert.match(progress, /MISSION_TERMINAL/);
});
