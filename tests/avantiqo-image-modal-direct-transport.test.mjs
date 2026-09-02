import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const provider = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProvider.js", import.meta.url),
  "utf8",
);
const registration = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProviderRegistration.js", import.meta.url),
  "utf8",
);
const sharedWorker = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-owned/AvantiqoOwnedModalWorker.js", import.meta.url),
  "utf8",
);
const modalApp = fs.readFileSync(
  new URL("../services/avantiqo-image-engine/modal_app.py", import.meta.url),
  "utf8",
);

test("Image primary lane uses direct Modal named function transport", () => {
  assert.match(provider, /transportMode:\s*"direct-sdk"/);
  assert.match(provider, /appName:\s*"avantiqo-image-owned"/);
  assert.match(provider, /functionName:\s*"generate"/);
  assert.match(provider, /jobPrefix:\s*"modal-image-direct:"/);
  assert.doesNotMatch(provider, /AVANTIQO_IMAGE_MODAL_BASE_URL/);
  assert.doesNotMatch(provider, /AVANTIQO_IMAGE_MODAL_GATEWAY_TOKEN/);
  assert.doesNotMatch(provider, /RUNPOD_API_KEY/);
});

test("Shared owned Modal worker executes and polls direct FunctionCall IDs", () => {
  assert.match(sharedWorker, /client\.functions\.fromName\(config\.appName, config\.functionName/);
  assert.match(sharedWorker, /worker\.spawn\(\[payload\]\)/);
  assert.match(sharedWorker, /client\.functionCalls\.fromId\(rawJobId\)/);
  assert.match(sharedWorker, /modal_gateway_used:\s*false/);
  assert.match(sharedWorker, /modal_transport:\s*DIRECT_MODAL_TRANSPORT/);
});

test("Image Modal app exposes owned direct GPU generate function", () => {
  assert.match(modalApp, /APP_NAME = "avantiqo-image-owned"/);
  assert.match(modalApp, /@app\.function\(/);
  assert.match(modalApp, /def generate\(/);
  assert.match(modalApp, /gpu="A100-80GB"/);
  assert.match(modalApp, /min_containers=0/);
  assert.match(modalApp, /max_containers=1/);
  assert.match(modalApp, /buffer_containers=0/);
  assert.match(modalApp, /scaledown_window=5/);
});

test("Image registration requires direct Modal credentials and owned-only routing", () => {
  assert.match(registration, /MODAL_TOKEN_ID \|\| process\.env\.AVANTIQO_MODAL_TOKEN_ID/);
  assert.match(registration, /MODAL_TOKEN_SECRET \|\| process\.env\.AVANTIQO_MODAL_TOKEN_SECRET/);
  assert.match(registration, /transport:\s*"modal-js-sdk-function-call-v1"/);
  assert.match(registration, /modal_app:\s*"avantiqo-image-owned"/);
  assert.match(registration, /modal_function:\s*"generate"/);
  assert.match(registration, /modal_gateway_used:\s*false/);
  assert.match(registration, /owned_only_required:\s*true/);
  assert.match(registration, /external_provider_fallback_allowed:\s*false/);
  assert.match(registration, /runpod_generation_routing:\s*false/);
  assert.doesNotMatch(registration, /AVANTIQO_IMAGE_MODAL_BASE_URL/);
  assert.doesNotMatch(registration, /AVANTIQO_IMAGE_MODAL_GATEWAY_TOKEN/);
});

test("Image direct transport preserves private Avantiqo output storage", () => {
  assert.match(sharedWorker, /const OUTPUT_BUCKET = "creative-assets"/);
  assert.match(sharedWorker, /createSignedUploadUrl\(path/);
  assert.match(sharedWorker, /storage:\/\/\$\{OUTPUT_BUCKET\}\/\$\{path\}/);
  assert.match(sharedWorker, /resolveCreativeProviderAssetUrl/);
  assert.match(registration, /output_storage:\s*"AVANTIQO_PRIVATE_CREATIVE_STORAGE"/);
});
