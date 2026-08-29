import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertOwnedProviderBeforeLease(runtime, preflightName) {
  assert.match(runtime, /const OWNED_PROVIDER = "avantiqo-voice"/);
  assert.match(runtime, /owned_only_required: true/);
  assert.match(runtime, /external_fallback_allowed: false/);
  assert.match(runtime, /provider_id: OWNED_PROVIDER/);
  assert.match(runtime, /preferredProvider: OWNED_PROVIDER/);
  assert.match(runtime, /allowed_providers: Object\.freeze\(\[OWNED_PROVIDER\]\)/);
  assert.match(runtime, /EXTERNAL_PROVIDER_FORBIDDEN/);

  const preflightIndex = runtime.indexOf(`await ${preflightName}(organization)`);
  const leaseIndex = runtime.indexOf("await acquireVoiceRunpodWebLease");
  const executeIndex = runtime.indexOf("await ServiceExecutionRuntime.execute");

  assert.ok(preflightIndex >= 0, `${preflightName} must be called`);
  assert.ok(leaseIndex > preflightIndex, "provider preflight must happen before RunPod lease");
  assert.ok(executeIndex > leaseIndex, "provider execution must happen only after owned RunPod lease");
}

test("recorded STT proves owned provider before waking RunPod", async () => {
  const runtime = await source(
    "lib/operator/runtime/OperatorVoiceAsyncTranscriptionRuntime.js",
  );
  assertOwnedProviderBeforeLease(runtime, "assertOwnedSttProviderReady");
});

test("TTS proves owned provider before waking RunPod", async () => {
  const runtime = await source(
    "lib/operator/runtime/OperatorVoiceAsyncSpeechRuntime.js",
  );
  assertOwnedProviderBeforeLease(runtime, "assertOwnedTtsProviderReady");
});
