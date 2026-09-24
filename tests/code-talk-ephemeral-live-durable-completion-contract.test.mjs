import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");

test("live Code narration is rendered only while work is active", () => {
  assert.match(ide, /\{liveTalkActive && talkActivityNarration\.length \?/);
  assert.doesNotMatch(ide, /\{\(liveTalkActive \|\| missionResult\) && talkActivityNarration\.length \?/);
});

test("completed Code missions write a durable explanatory assistant turn", () => {
  assert.match(ide, /function codeMissionCompletionSummary/);
  assert.match(ide, /What I changed:/);
  assert.match(ide, /Why:/);
  assert.match(ide, /Verification:/);
  assert.match(ide, /What this means:/);
  assert.match(ide, /Still outstanding:/);
  assert.match(ide, /const summaryId = `mission-summary-\$\{missionId\}`/);
  assert.match(ide, /current\.some\(\(turn\) => turn\.id === summaryId\)/);
  assert.match(ide, /\.filter\(\(turn\) => \["user", "assistant", "design_preview", "visual", "image"\]\.includes\(turn\?\.role\)\)/);
});
