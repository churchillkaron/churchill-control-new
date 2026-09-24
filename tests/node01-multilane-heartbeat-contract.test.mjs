import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile(
  new URL("../scripts/local-node/avantiqo-node01-worker.ps1", import.meta.url),
  "utf8",
);

test("Node01 heartbeat publishes stable multi-lane node metadata", () => {
  assert.match(worker, /worker_lane='multi'/);
  assert.match(worker, /worker_lanes=@\('cpu','gpu','live','training'\)/);
  assert.match(worker, /heartbeat_source_lane=\$Lane/);
  assert.match(worker, /active_lanes=@\('cpu','gpu','live','training'\)/);
  assert.doesNotMatch(worker, /worker_lane=\$Lane/);
});
