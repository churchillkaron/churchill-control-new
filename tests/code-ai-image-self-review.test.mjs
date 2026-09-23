import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const imageProvider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProvider.js", "utf8");
const imageRoute = fs.readFileSync("app/api/operator/code/image/route.js", "utf8");
const worker = fs.readFileSync("scripts/local-node/avantiqo-node01-worker.ps1", "utf8");
const ide = fs.readFileSync("components/creative/code/AvantiqoCodeIDE.jsx", "utf8");

test("image analysis routes to owned Node01 vision before external fallback", () => {
  assert.match(imageProvider, /\["ai\.image\.analyze", "document\.ocr", "document\.classify"\]\.includes\(capability\)/);
  assert.match(imageProvider, /const provider = await requireLocal\(AvantiqoDocumentVisionLocalQueueProvider[\s\S]*?return provider\.execute\(input\)/);
  assert.match(imageRoute, /"ai\.image\.analyze"/);
  assert.match(imageRoute, /REVIEW_DISCUSSION_VISUAL/);
});

test("GPU ownership explicitly hands off between warm image server and local vision", () => {
  assert.match(worker, /'ai\.image\.analyze','document\.ocr','document\.classify'/);
  assert.match(worker, /function StopImageServerForExclusiveGpu/);
  assert.match(worker, /Stop-ScheduledTask -TaskName 'AvantiqoImageServer'/);
  assert.match(worker, /function EnsureImageServer/);
  assert.match(worker, /Start-ScheduledTask -TaskName 'AvantiqoImageServer'/);
  assert.match(worker, /RunDocumentVisionJob[\s\S]*StopImageServerForExclusiveGpu/);
  assert.match(worker, /RunImageGenerateJob[\s\S]*EnsureImageServer/);
});

test("Code Studio visually reviews final hero renders and performs at most one targeted repair", () => {
  assert.match(ide, /async function reviewDesignPreviewAsset/);
  assert.match(ide, /score >= 88/);
  assert.match(ide, /direction_image_statuses:[\s\S]*"reviewing"/);
  assert.match(ide, /direction_image_statuses:[\s\S]*"repairing"/);
  assert.match(ide, /review\.repair_prompt/);
  assert.match(ide, /"needs-review"/);
  assert.match(ide, /vision passed/);
});
