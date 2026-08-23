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

test("owned media benchmark records conservative economics without auto-certification", () => {
  const runner = source("scripts/benchmark-avantiqo-owned-media-full.mjs");
  assert.match(runner, /AVANTIQO_IMAGE_GPU_USD_PER_SECOND/);
  assert.match(runner, /AVANTIQO_VIDEO_GPU_USD_PER_SECOND/);
  assert.match(runner, /AVANTIQO_LIPSYNC_GPU_USD_PER_SECOND/);
  assert.match(runner, /RUNPOD_RUNSYNC_WALL_TIME_CONSERVATIVE/);
  assert.match(runner, /estimated_supplier_compute_cost_usd/);
  assert.match(runner, /economics_certified:\s*false/);
  assert.match(runner, /ready_for_human_quality_review/);
  assert.match(runner, /production_certified:\s*0/);
  assert.match(runner, /automatic_activation_forbidden:\s*true/);
});

test("canonical local flow requires mechanics, economics and emits pending human review", () => {
  const flow = source("scripts/certify-avantiqo-owned-media-local.sh");
  assert.match(flow, /prepare-avantiqo-owned-media-certification-fixtures\.mjs/);
  assert.match(flow, /benchmark-avantiqo-owned-media-full\.mjs/);
  assert.match(flow, /prepare-avantiqo-owned-media-human-review\.mjs/);
  assert.match(flow, /AVANTIQO_MEDIA_CERTIFICATION_ECONOMICS_EVIDENCE_INCOMPLETE/);
  assert.match(flow, /AVANTIQO_MEDIA_CERTIFICATION_LIPSYNC_FIXTURE_NOT_NORMALIZED/);
  assert.match(flow, /HUMAN_REVIEW=PENDING/);
  assert.match(flow, /PRODUCTION_ACTIVATION=FORBIDDEN/);
});

test("human review manifest covers all fifteen owned media capabilities and cannot auto-pass", () => {
  const review = source("scripts/prepare-avantiqo-owned-media-human-review.mjs");
  for (const capability of [
    "ai.image.generate",
    "ai.image.edit",
    "ai.image.inpaint",
    "ai.image.outpaint",
    "ai.image.upscale",
    "ai.image.analyze",
    "ai.video.generate",
    "ai.video.image_to_video",
    "ai.video.first_last_frame_to_video",
    "ai.video.video_to_video",
    "ai.video.edit",
    "ai.video.inpaint",
    "ai.video.extend",
    "ai.video.upscale",
    "ai.video.lipsync",
  ]) {
    assert.match(review, new RegExp(capability.replaceAll(".", "\\.")));
  }
  assert.match(review, /PENDING_HUMAN_REVIEW/);
  assert.match(review, /automatic_human_approval_forbidden:\s*true/);
  assert.match(review, /human_quality_certified:\s*false/);
  assert.match(review, /activation_allowed:\s*false/);
});

test("human review finalizer requires explicit threshold evidence and still forbids activation", () => {
  const finalizer = source("scripts/finalize-avantiqo-owned-media-human-review.mjs");
  assert.match(finalizer, /REVIEWER_REQUIRED/);
  assert.match(finalizer, /REVIEWED_AT_REQUIRED/);
  assert.match(finalizer, /score >= minimum/);
  assert.match(finalizer, /evidence_note\)\.length >= 8/);
  assert.match(finalizer, /AVANTIQO_OWNED_MEDIA_CERTIFICATION_EVIDENCE_V1/);
  assert.match(finalizer, /production_certified:\s*false/);
  assert.match(finalizer, /pricing_status:\s*"NOT_PRODUCTION_CERTIFIED"/);
  assert.match(finalizer, /activation_allowed:\s*false/);
  assert.match(finalizer, /automatic_activation_forbidden:\s*true/);
});

test("owned lip-sync reports comparable generation timing", () => {
  const worker = source("services/avantiqo-lipsync-engine/handler.py");
  assert.match(worker, /"generation_seconds": round\(time\.perf_counter\(\) - started, 3\)/);
});
