import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const master = fs.readFileSync("lib/creative/video/runtime/CreativeVideoStudioMasterRuntime.js", "utf8");
const foundation = fs.readFileSync("lib/creative/video/runtime/CreativeVideoStudioFoundationRuntime.js", "utf8");
const queue = fs.readFileSync("lib/creative/media/runtime/CreativeLocalMediaQueueRuntime.js", "utf8");
const worker = fs.readFileSync("scripts/local-node/avantiqo-node01-worker.ps1", "utf8");

test("Video Studio CPU mastering prefers Node 01 ffmpeg with safe fallback", () => {
  assert.match(master, /CreativeLocalMediaQueueRuntime\.available/);
  assert.match(master, /operation: "video_master"/);
  assert.match(master, /AVANTIQO_LOCAL_NODE_FFMPEG_LANCZOS/);
  assert.match(master, /AVANTIQO_VIDEO_MASTER_LOCAL_FALLBACK/);
});

test("Video Studio foundation assembly prefers Node 01 ffmpeg", () => {
  assert.match(foundation, /CreativeLocalMediaQueueRuntime\.available/);
  assert.match(foundation, /operation: "raw_frames_to_mp4"/);
  assert.match(foundation, /ffmpeg_location: "AVANTIQO_LOCAL_NODE"/);
});

test("shared media queue is bounded to registered ffmpeg capability", () => {
  assert.match(queue, /media\.ffmpeg\.process/);
  assert.match(queue, /workload: "media_ffmpeg"/);
  assert.match(queue, /model: "ffmpeg-9\.0\.1"/);
  assert.match(worker, /media\.ffmpeg\.process/);
  assert.match(worker, /RunMediaJob/);
});
