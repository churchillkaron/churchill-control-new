import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const home = fs.readFileSync("components/operator/HomeAvantiqoIntelligence.jsx", "utf8");
const bridge = fs.readFileSync("components/operator/AutonomousWatchAlertBridge.jsx", "utf8");

test("passive attention display never replays a persisted thesis as page-load speech", () => {
  assert.match(home, /passiveSnapshot: true/);
  assert.doesNotMatch(home, /thesisInterruptionSpeech/);
  assert.doesNotMatch(home, /synthetic-intelligence-interruption/);
  assert.doesNotMatch(home, /avantiqo:thesis-interruption:/);
});

test("autonomous watch remains the single proactive alert speech owner", () => {
  assert.match(bridge, /source: "synthetic-intelligence-autonomous-watch"/);
  assert.match(bridge, /mode\)\.toLowerCase\(\) === "interrupt"/);
  assert.match(bridge, /avantiqo:autonomous-watch-spoken:/);
});
