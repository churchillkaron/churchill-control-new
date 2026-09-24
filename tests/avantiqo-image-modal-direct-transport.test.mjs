import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProvider.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProviderRegistration.js", "utf8");

test("active Image transport is Node01 local-only", () => {
  assert.match(provider, /AvantiqoImageGenerateLocalQueueProvider/);
  assert.match(provider, /AvantiqoDocumentVisionLocalQueueProvider/);
  assert.match(provider, /AvantiqoImageUpscaleLocalQueueProvider/);
  assert.doesNotMatch(provider, /Modal|RunPod|runpod/);
  assert.match(registration, /infrastructure_provider: "AVANTIQO_LOCAL_NODE_V1"/);
  assert.match(registration, /infrastructure_candidates: \["AVANTIQO_LOCAL_NODE_V1"\]/);
  assert.match(registration, /local_only_execution: true/);
  assert.match(registration, /modal_fallback_for_local_capabilities: false/);
  assert.match(registration, /external_provider_fallback_allowed: false/);
});

test("Image output remains private Avantiqo storage", () => {
  assert.match(registration, /output_storage:\s*"AVANTIQO_PRIVATE_CREATIVE_STORAGE"/);
  assert.match(registration, /local_generation_storage:\s*"SUPABASE_PRIVATE_CREATIVE_ASSETS"/);
});
