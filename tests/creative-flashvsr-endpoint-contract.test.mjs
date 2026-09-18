import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const api=fs.readFileSync('services/avantiqo-video-flashdreams-flashvsr/flashvsr_api.py','utf8');
const worker=fs.readFileSync('services/avantiqo-video-flashdreams-flashvsr/flashdreams_flashvsr_worker.py','utf8');
const docker=fs.readFileSync('services/avantiqo-video-flashdreams-flashvsr/Dockerfile','utf8');
const provider=fs.readFileSync('lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoFlashVsrProvider.js','utf8');

test('endpoint and provider use the exact newer FlashDreams worker contract',()=>{
  assert.match(worker,/CONTRACT = "AVANTIQO_VIDEO_FLASHDREAMS_FLASHVSR_GPU_MASTER_V1"/);
  assert.match(provider,/AVANTIQO_VIDEO_FLASHDREAMS_FLASHVSR_GPU_MASTER_V1/);
  assert.match(api,/WORKER_CONTRACT = worker\.CONTRACT/);
});

test('production lane is 1920x1088 temporal work to 3840x2176 then exact UHD crop',()=>{
  assert.match(worker,/SCALE = 2/);
  assert.match(api,/"width": 3840/);
  assert.match(api,/"height": 2176/);
  assert.match(api,/working_width": 1920/);
  assert.match(api,/working_height": 1088/);
  assert.match(api,/crop=3840:2160:0:8/);
});

test('endpoint remuxes audio and uploads final mp4',()=>{
  assert.match(api,/"-map", "1:a\?"/);
  assert.match(api,/"-c:a", "aac"/);
  assert.match(api,/Content-Type": "video\/mp4"/);
  assert.match(api,/audio_remuxed": True/);
});

test('container exposes HTTP endpoint and includes ffmpeg',()=>{
  assert.match(docker,/ffmpeg/);
  assert.match(docker,/EXPOSE 8000/);
  assert.match(docker,/flashvsr_api\.py/);
});

test('endpoint serializes GPU work and forbids per-frame SR semantics',()=>{
  assert.match(api,/LOCK = threading\.Lock\(\)/);
  assert.match(api,/with LOCK/);
  assert.match(api,/per_frame_independent_sr": False/);
});
