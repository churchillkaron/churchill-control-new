import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("Node 01 owns image upscaling with exact Swin2SR and Modal fallback", () => {
  const provider = source("lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProvider.js");
  const queue = source("lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageUpscaleLocalQueueProvider.js");
  const worker = source("scripts/local-node/avantiqo-node01-worker.ps1");
  const runner = source("scripts/local-node/avantiqo-node01-image-upscale-runner.py");
  assert.match(provider, /AvantiqoImageUpscaleLocalQueueProvider\.available/);
  assert.match(provider, /AVANTIQO_IMAGE_UPSCALE_LOCAL_FALLBACK_MODAL/);
  assert.match(queue, /ai\.image\.upscale/);
  assert.match(queue, /caidas\/swin2SR-realworld-sr-x4-64-bsrgan-psnr/);
  assert.match(worker, /'ai\.image\.upscale'/);
  assert.match(worker, /RunImageUpscaleJob/);
  assert.match(runner, /tiled_inference/);
  assert.match(runner, /tile_size/);
  assert.match(runner, /scale = 4/);
  assert.match(runner, /LOCAL_GPU/);
});

test("Compute administration exposes date-time and product routing", () => {
  const page = source("app/(system)/workspace/[organizationId]/administration/compute/page.jsx");
  const route = source("app/api/workspace/administration/compute/route.js");
  assert.match(page, /CalendarClock/);
  assert.match(page, /clock\.date/);
  assert.match(page, /clock\.time/);
  assert.match(page, /Product/);
  assert.match(page, /Business Partner \/ Intelligence/);
  assert.match(page, /Voice \/ speech-to-text/);
  assert.match(page, /Image upscaling/);
  assert.match(route, /product_area/);
  assert.match(route, /LOCAL_GPU_SWIN2SR_FIRST/);
});
