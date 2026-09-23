import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const dock = fs.readFileSync("components/operator/HomeAvantiqoIntelligenceDock.jsx", "utf8");
const bridge = fs.readFileSync("components/operator/AutonomousWatchAlertBridge.jsx", "utf8");

test("speech gate permits only governed urgent autonomous-watch interruptions without voice initiation", () => {
  assert.match(dock, /const governedAutonomousInterrupt =/);
  assert.match(dock, /source === "synthetic-intelligence-autonomous-watch"/);
  assert.match(dock, /text\(detail\.priority\)\.toLowerCase\(\) === "urgent"/);
  assert.match(dock, /Boolean\(text\(detail\.dedupe_key\)\)/);
  assert.match(dock, /!explicitlyVoiceInitiated && !homeVoiceReply && !governedAutonomousInterrupt/);
});

test("autonomous watch emits the exact governed speech envelope accepted by the dock", () => {
  assert.match(bridge, /source: "synthetic-intelligence-autonomous-watch"/);
  assert.match(bridge, /priority: "urgent"/);
  assert.match(bridge, /dedupe_key: dedupeKey/);
});
