import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("components/operator/HomeAvantiqoIntelligence.jsx", "utf8");

test("voice commands and queued corrections always use the latest Business Partner send function", () => {
  assert.match(source, /const sendMessageRef = useRef\(null\)/);
  assert.match(source, /sendMessageRef\.current = sendMessage/);
  assert.match(source, /sendMessageRef\.current\?\.\(message, event\?\.detail\?\.source \|\| "voice"\)/);
  assert.match(source, /sendMessageRef\.current\?\.\(nextQueuedTurn\.message, nextQueuedTurn\.source \|\| "text"\)/);
});
