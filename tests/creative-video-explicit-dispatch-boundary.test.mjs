import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const SERVICE_RESOLVER =
  "lib/creative/services/CreativeServiceResolver.js";
const VIDEO_DISPATCH =
  "lib/creative/video/runtime/CreativeVideoGenerationDispatchRuntime.js";
const DIRECTOR =
  "lib/creative/director/runtime/CreativeDirectorRuntime.js";

test("video generation cannot use generic service execution without explicit governed dispatch", async () => {
  const [resolver, dispatch, director] = await Promise.all([
    fs.readFile(SERVICE_RESOLVER, "utf8"),
    fs.readFile(VIDEO_DISPATCH, "utf8"),
    fs.readFile(DIRECTOR, "utf8"),
  ]);

  assert.match(resolver, /CREATIVE_SINGLE_MEDIA_EXECUTION_APPROVAL_V1/);
  assert.match(resolver, /CREATIVE_VIDEO_EXPLICIT_DISPATCH_REQUIRED/);
  assert.match(resolver, /CREATIVE_VIDEO_DISPATCH_AUTHORIZATION_SCOPE_MISMATCH/);
  assert.match(resolver, /CREATIVE_VIDEO_GOVERNED_WORKER_REQUIRED/);
  assert.match(resolver, /authorization\.consumed !== true/);
  assert.match(resolver, /authorization\.publication_authorized !== false/);
  assert.match(resolver, /taskWorkerId\.startsWith\("creative-video-dispatch:"\)/);
  assert.match(resolver, /metadataWorkerId !== taskWorkerId/);

  assert.match(dispatch, /CreativeVideoGenerationPreflightRuntime\.resolve/);
  assert.match(dispatch, /CreativeBrandFidelityExecutionGate\.enforce/);
  assert.match(dispatch, /media_generation_authorization:\s*consumedAuthorization/);
  assert.match(dispatch, /dispatch_worker_id:\s*workerId/);
  assert.match(dispatch, /ProductionTaskRuntime\.dispatchClaimed/);

  assert.match(director, /AWAITING_EXPLICIT_VIDEO_GENERATION/);
  assert.match(director, /automatic_dispatch_allowed:\s*false/);
  assert.match(director, /explicit_start_required:\s*true/);
});
