import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");

test("Talk prefers concrete repository activity while a mission is active", () => {
  assert.match(ide, /const newestConcreteEvent = activityEvents\.find/);
  assert.match(ide, /repository_operation/);
  assert.match(
    ide,
    /const liveNarrationEntry = newestEventTerminal\s*\? newestNarrationEntry\s*:\s*newestConcreteNarrationEntry \|\| newestNonLifecycleEntry \|\| newestNarrationEntry/,
  );
});

test("terminal mission events override older concrete activity", () => {
  assert.match(ide, /terminalMissionStates\.has\(authoritativeMissionState\)[\s\S]*!authoritativeMissionState && \/mission_completed\|mission_terminal\|completed\|blocked\|failed\|stopped\|cancelled\//);
});
