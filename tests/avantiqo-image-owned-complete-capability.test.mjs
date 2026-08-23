import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("owned Image implements the complete six-capability target without default over-certification", () => {
  const registration = source(
    "lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProviderRegistration.js",
  );

  for (const capability of [
    "ai.image.generate",
    "ai.image.edit",
    "ai.image.inpaint",
    "ai.image.outpaint",
    "ai.image.upscale",
    "ai.image.analyze",
  ]) {
    assert.match(registration, new RegExp(capability.replaceAll(".", "\\.")));
  }
  assert.match(registration, /IMPLEMENTED_CAPABILITIES = Object\.freeze\(\[\.\.\.TARGET_CAPABILITIES\]\)/);
  assert.match(registration, /return configured\.length \? \[\.\.\.new Set\(configured\)\] : \["ai\.image\.generate"\]/);
  assert.match(registration, /AVANTIQO_IMAGE_CAPABILITY_CONFIGURATION_V2/);
  assert.match(registration, /owned_super_resolution:\s*true/);
  assert.match(registration, /owned_visual_analysis:\s*true/);
  assert.match(registration, /structured_visual_evidence:\s*true/);
});

test("owned Image analysis is structured inference rather than fake generated media", () => {
  const provider = source(
    "lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProvider.js",
  );
  const worker = source("services/avantiqo-image-engine/handler_v2.py");

  assert.match(provider, /"ai\.image\.analyze":\s*null/);
  assert.match(worker, /ANALYZE_CAPABILITY = "ai\.image\.analyze"/);
  assert.match(worker, /Qwen\/Qwen2\.5-VL-7B-Instruct/);
  assert.match(worker, /pipeline\(\s*"image-text-to-text"/);
  assert.match(worker, /AVANTIQO_IMAGE_ANALYSIS_JSON_REQUIRED/);
  assert.match(worker, /"structured_visual_evidence": True/);
  assert.match(worker, /"result": parsed/);
});

test("owned Image upscale uses bounded super-resolution and private storage", () => {
  const worker = source("services/avantiqo-image-engine/handler_v2.py");

  assert.match(worker, /UPSCALE_CAPABILITY = "ai\.image\.upscale"/);
  assert.match(worker, /caidas\/swin2SR-realworld-sr-x4-64-bsrgan-psnr/);
  assert.match(worker, /pipeline\(\s*"image-to-image"/);
  assert.match(worker, /MAX_UPSCALE_SOURCE_PIXELS/);
  assert.match(worker, /MAX_UPSCALE_OUTPUT_PIXELS/);
  assert.match(worker, /AVANTIQO_IMAGE_UPSCALE_SOURCE_TOO_LARGE/);
  assert.match(worker, /AVANTIQO_IMAGE_UPSCALE_OUTPUT_PIXEL_BUDGET_EXCEEDED/);
  assert.match(worker, /legacy\._upload\(path, data\["storage_upload"\]\)/);
  assert.match(worker, /AVANTIQO_IMAGE_UPSCALE_RESOURCE_BUDGET_V1/);
});

test("Image V2 delegates established capabilities and is the container entrypoint", () => {
  const worker = source("services/avantiqo-image-engine/handler_v2.py");
  const docker = source("services/avantiqo-image-engine/Dockerfile");

  assert.match(worker, /return legacy\.handler\(job\)/);
  assert.match(docker, /COPY handler\.py \.\/handler\.py/);
  assert.match(docker, /COPY handler_v2\.py \.\/handler_v2\.py/);
  assert.match(docker, /CMD \["python", "-u", "handler_v2\.py"\]/);
});

test("owned Image upscale and analysis models are license-gated by exact capability", () => {
  const policy = source(
    "lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js",
  );

  assert.match(policy, /caidas\/swin2SR-realworld-sr-x4-64-bsrgan-psnr/);
  assert.match(policy, /Qwen\/Qwen2\.5-VL-7B-Instruct/);
  assert.match(policy, /capabilities: Object\.freeze\(\["ai\.image\.upscale"\]\)/);
  assert.match(policy, /capabilities: Object\.freeze\(\["ai\.image\.analyze"\]\)/);
  assert.match(policy, /license_verified:\s*true/);
  assert.match(policy, /runtime_compatible:\s*true/);
});
