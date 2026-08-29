import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("global Operator speaks only for explicit Voice intent or urgent alerts", async () => {
  const operator = await source("components/operator/AvantiqoOperator.jsx");

  assert.match(operator, /const voiceInitiated = event\?\.detail\?\.voice_initiated === true/);
  assert.match(operator, /const urgent = text\(event\?\.detail\?\.priority\)\.toLowerCase\(\) === "urgent"/);
  assert.match(operator, /\(!voiceInitiated && !urgent\)/);
  assert.match(operator, /KEYBOARD_WAKE_BLOCK_MS = 3000/);
  assert.match(operator, /OPERATOR_SPOKEN_REPLY_TIMEOUT_MS = 20 \* 1000/);
  assert.match(operator, /OPERATOR_RECORDED_STT_TIMEOUT_MS = 20 \* 1000/);
});

test("ordinary typed send remains text", async () => {
  const operator = await source("components/operator/AvantiqoOperator.jsx");
  const home = await source("components/operator/HomeAvantiqoIntelligence.jsx");

  assert.match(operator, /async function sendMessage\(rawValue, source = "text"\)/);
  assert.match(home, /async function sendMessage\(rawValue, source = "text"\)/);
  assert.match(home, /if \(source === "voice"\) \{\s*speakResponse\(responseText\);/);
});
