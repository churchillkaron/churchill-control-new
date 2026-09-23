import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageGenerateLocalQueueProvider.js", "utf8");
const imageProvider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProvider.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProviderRegistration.js", "utf8");
const worker = fs.readFileSync("scripts/local-node/avantiqo-node01-worker.ps1", "utf8");
const runner = fs.readFileSync("scripts/local-node/avantiqo-node01-image-generate-runner.py", "utf8");

test("ai.image.generate is Supabase-queued to Node01 before Modal", () => {
  assert.match(provider, /CAPABILITY = "ai\.image\.generate"/);
  assert.match(provider, /avantiqo_local_compute_jobs/);
  assert.match(provider, /workload: "image_generate"/);
  assert.match(provider, /creative-assets/);
  assert.match(provider, /Q3_K/);
  assert.match(imageProvider, /AvantiqoImageGenerateLocalQueueProvider/);
  assert.match(imageProvider, /capability === "ai\.image\.generate"/);
  assert.match(imageProvider, /AVANTIQO_IMAGE_GENERATE_LOCAL_FALLBACK_MODAL/);
  assert.ok(imageProvider.indexOf('capability === "ai.image.generate"') < imageProvider.indexOf("ownedImageWorker.execute"));
  assert.match(registration, /stable-diffusion\.cpp-cuda12/);
  assert.match(registration, /local_generation_quantization:\s*"Q3_K"/);
  assert.match(registration, /SUPABASE_PRIVATE_CREATIVE_ASSETS/);
});

test("Node01 worker owns a dedicated exclusive image generation lane", () => {
  assert.match(worker, /ai\.image\.generate/);
  assert.match(worker, /image_generate/);
  assert.match(worker, /Z_IMAGE_TURBO_Q3K_CPU_OFFLOAD/);
  assert.match(worker, /RunImageGenerateJob/);
  assert.match(worker, /UnloadOllamaModel/);
  assert.match(worker, /AVANTIQO_NODE01_Z_IMAGE_TURBO_GGUF_WARM_V2/);
  assert.match(worker, /sdcpp\/v1\/img_gen/);
  assert.match(worker, /AVANTIQO_LOCAL_GPU_OLLAMA_UNLOAD_TIMEOUT_18S/);
});

test("Node01 image runner uses the low-VRAM Z-Image Turbo GGUF bundle", () => {
  assert.match(runner, /z_image_turbo-Q3_K\.gguf/);
  assert.match(runner, /Qwen3-4B-Instruct-2507-Q4_K_M\.gguf/);
  assert.match(runner, /ae\.safetensors/);
  assert.match(runner, /--offload-to-cpu/);
  assert.match(runner, /"--backend", "te=cpu"/);
  assert.match(runner, /--diffusion-fa/);
  assert.match(runner, /--vae-tiling/);
  assert.match(runner, /MAX_PIXELS = 1_048_576/);
});
