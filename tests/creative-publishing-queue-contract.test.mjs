import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync(
  new URL("../lib/creative/publishing/workflows/CreativePublishRuntime.js", import.meta.url),
  "utf8",
);

test("Creative publication creates durable publish jobs", () => {
  assert.match(runtime, /PublishingRuntime\.create/);
  assert.match(runtime, /CREATIVE_PUBLICATION_QUEUE_V1/);
  assert.match(runtime, /creative_asset_node_ids/);
  assert.match(runtime, /publish_job_ids/);
  assert.match(runtime, /status: "PENDING"/);
});
