import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const ui = fs.readFileSync(
  new URL("../components/operator/HomeAvantiqoIntelligence.jsx", import.meta.url),
  "utf8",
);

test("Business Partner accepts text or voice corrections while an earlier turn is working", () => {
  assert.match(ui, /const pendingTurnQueueRef = useRef\(\[\]\)/);
  assert.match(ui, /if \(busyRef\.current\) \{/);
  assert.match(ui, /pendingTurnQueueRef\.current = \[/);
  assert.match(ui, /method: "DELETE"/);
  assert.match(ui, /\/api\/operator\/live-execution/);
  assert.match(ui, /Correct or redirect Avantiqo while it works/);
});

test("queued correction automatically becomes the next conversational turn", () => {
  assert.match(ui, /const nextQueuedTurn = pendingTurnQueueRef\.current\.shift\(\)/);
  assert.match(ui, /sendMessage\(nextQueuedTurn\.message, nextQueuedTurn\.source \|\| "text"\)/);
  assert.match(ui, /data-avantiqo-home-input="true"[\s\S]{0,220}disabled=\{restoring\}/);
  assert.match(ui, /\{busy \? "Update" : "Send"\}/);
});
