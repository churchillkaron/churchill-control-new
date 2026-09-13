import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(
  new URL("../lib/creative/publishing/workflows/CreativePublishRuntime.js", import.meta.url),
  "utf8",
);

test("Creative publication creates durable publish jobs", () => {
  assert.match(workflow, /CreativeChannelExecutionRuntime\.queue/);
  assert.match(workflow, /creative_asset_node_ids/);
  assert.match(workflow, /campaign:/);
  assert.match(workflow, /channel_settings:/);
});
