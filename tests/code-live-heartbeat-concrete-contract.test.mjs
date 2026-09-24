import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../app/api/operator/code/mission/route.js", import.meta.url), "utf8");
const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");

test("background heartbeat does not overwrite fresh concrete progress", () => {
  assert.match(route, /loadCodeAILiveProgress\(/);
  assert.match(route, /const freshRealProgress = Number\.isFinite\(latestAt\) && \(Date\.now\(\) - latestAt\) < 12000/);
  assert.match(route, /if \(freshRealProgress\) return/);
  assert.match(route, /latestDescription/);
  assert.match(route, /file_path: !genericLatest \? \(latestFilePath \|\| null\) : null/);
});

test("visible Talk filters transient recovery filler immediately", () => {
  assert.match(ide, /const visibleChatTurns = useMemo\(\(\) => dedupeAdjacentTalkTurns\(chatTurns\), \[chatTurns\]\)/);
  assert.match(ide, /visibleChatTurns\.length \? visibleChatTurns\.map/);
  assert.match(ide, /i’m still working out the safest next move from what i’ve already inspected/);
});
