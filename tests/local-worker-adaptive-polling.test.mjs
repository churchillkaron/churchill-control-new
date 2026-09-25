import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const codeAgent = fs.readFileSync("scripts/code-device-agent.mjs", "utf8");
const nodeWorker = fs.readFileSync("scripts/local-node/avantiqo-node01-worker.ps1", "utf8");

test("code device decouples heartbeat from idle job polling", () => {
  assert.match(codeAgent, /DEVICE_HEARTBEAT_INTERVAL_MS/);
  assert.match(codeAgent, /DEVICE_IDLE_POLL_INTERVAL_MS/);
  assert.match(codeAgent, /now-lastHeartbeatAt>=DEVICE_HEARTBEAT_INTERVAL_MS/);
  assert.doesNotMatch(codeAgent, /handled\?75:350/);
});

test("node01 worker backs off claims when its lane is idle", () => {
  assert.match(nodeWorker, /if \(\$jobs.Count -gt 0\) \{ 1 \} else \{ 5 \}/);
  assert.match(nodeWorker, /Start-Sleep -Seconds \$pollSleepSeconds/);
});
