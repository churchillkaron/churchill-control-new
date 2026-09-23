import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");

test("terminal mission narration overrides older concrete repository activity", () => {
  assert.match(ide, /terminalMissionStates\.has\(authoritativeMissionState\)[\s\S]*!authoritativeMissionState && \/mission_completed\|mission_terminal\|completed\|blocked\|failed\|stopped\|cancelled\//);
  assert.match(
    ide,
    /const liveNarrationEntry = newestEventTerminal\s*\? newestNarrationEntry\s*:\s*newestConcreteNarrationEntry \|\| newestNonLifecycleEntry \|\| null/,
  );
});

test("terminal narration does not keep an elapsed live timer", () => {
  assert.match(
    ide,
    /if \(\/mission_completed\|mission_terminal\|completed\|blocked\|failed\|stopped\|cancelled\/\.test\(phase\)\) \{\s*return conversationalCodeActivity\(event\);/,
  );
});
