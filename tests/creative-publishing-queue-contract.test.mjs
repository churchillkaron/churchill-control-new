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

const legacyPublishingRoute = fs.readFileSync(
  new URL("../app/api/creative/publishing/route.js", import.meta.url),
  "utf8",
);
const legacyExecutionRuntime = fs.readFileSync(
  new URL("../lib/creative/publishing/runtime/CreativeChannelExecutionRuntime.js", import.meta.url),
  "utf8",
);
const lateStillCertificationRoute = fs.readFileSync(
  new URL("../app/api/creative/release/still/certify/route.js", import.meta.url),
  "utf8",
);
const commandCenterRoute = fs.readFileSync(
  new URL("../app/api/workspace/creative/command-center/route.js", import.meta.url),
  "utf8",
);

test("legacy publish queue is retired and late still certification reuses persisted evidence", () => {
  assert.match(legacyPublishingRoute, /CREATIVE_LEGACY_PUBLISHING_ENDPOINT_RETIRED_USE_RELEASE_AUTHORITY/);
  assert.doesNotMatch(legacyPublishingRoute, /PublishingRuntime\.create/);
  assert.match(legacyExecutionRuntime, /CREATIVE_LEGACY_PUBLISH_QUEUE_RETIRED_USE_RELEASE_AUTHORITY/);
  assert.doesNotMatch(legacyExecutionRuntime, /PublishingRuntime\.create/);
  assert.match(lateStillCertificationRoute, /loadImageStudioWorkspace/);
  assert.match(lateStillCertificationRoute, /evidence\.storage_reference/);
  assert.match(lateStillCertificationRoute, /evidence\.checksum/);
  assert.match(lateStillCertificationRoute, /CreativeStillReleaseCertificationRuntime\.certify/);
  assert.match(commandCenterRoute, /creative_asset_nodes_publication/);
  assert.doesNotMatch(commandCenterRoute, /creative_publish_jobs/);
});
