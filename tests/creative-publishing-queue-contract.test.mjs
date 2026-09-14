import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const publishRoute = fs.readFileSync(
  new URL("../app/api/creative/publish/route.js", import.meta.url),
  "utf8",
);
const commandRuntime = fs.readFileSync(
  new URL("../lib/creative/release/runtime/CreativePublishCommandRuntime.js", import.meta.url),
  "utf8",
);
const releaseRoute = fs.readFileSync(
  new URL("../app/api/creative/release/publish/route.js", import.meta.url),
  "utf8",
);

test("Creative publication uses governed release authority", () => {
  assert.match(publishRoute, /creative\.release\.publish/);
  assert.match(publishRoute, /CreativePublishCommandRuntime\.create/);
  assert.doesNotMatch(publishRoute, /CreativeChannelExecutionRuntime\.queue/);
  assert.match(publishRoute, /buildCreativeChannelExecutionBrief/);
  assert.match(commandRuntime, /execution_brief_identity/);
  assert.match(commandRuntime, /executionBriefPublicationText/);
  assert.match(commandRuntime, /publication_content_binding_identity/);
  assert.match(releaseRoute, /execution_brief/);
});
