import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProvider.js", "utf8");
const queue = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageUpscaleLocalQueueProvider.js", "utf8");
const worker = fs.readFileSync("scripts/local-node/avantiqo-node01-worker.ps1", "utf8");
const runner = fs.readFileSync("scripts/local-node/avantiqo-node01-image-upscale-runner.py", "utf8");

test("Node01 owns image upscaling with exact Swin2SR and no cloud fallback", () => {
  assert.match(provider, /AvantiqoImageUpscaleLocalQueueProvider/);
  assert.match(provider, /AVANTIQO_IMAGE_UPSCALE_LOCAL_NODE_UNAVAILABLE/);
  assert.doesNotMatch(provider, /Modal|RunPod|runpod/);
  assert.match(queue, /ai\.image\.upscale/);
  assert.match(queue, /caidas\/swin2SR-realworld-sr-x4-64-bsrgan-psnr/);
  assert.match(worker, /'ai\.image\.upscale'/);
  assert.match(worker, /RunImageUpscaleJob/);
  assert.match(runner, /tiled_inference/);
  assert.match(runner, /tile_size/);
  assert.match(runner, /scale = 4/);
  assert.match(runner, /LOCAL_GPU/);
});
