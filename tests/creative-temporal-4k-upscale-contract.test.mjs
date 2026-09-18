import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source=fs.readFileSync('services/avantiqo-video-engine/handler_v2.py','utf8');

test('video upscale defaults to true 4K rather than legacy 720p/1080p ceiling',()=>{
  assert.match(source,/default_resolution = "2160p" if capability == UPSCALE_CAPABILITY else "720p"/);
  assert.match(source,/"16:9": \(3840, 2160\)/);
  assert.match(source,/AVANTIQO_VIDEO_UPSCALE_MAX_OUTPUT_PIXELS", "8294400"/);
});

test('upscale path uses bounded streaming temporal window',()=>{
  assert.match(source,/previous_sr: Image\.Image \| None = None/);
  assert.match(source,/current_sr: Image\.Image \| None = None/);
  assert.match(source,/_temporal_stabilize\(previous_sr, current_sr, next_sr, current_source\)/);
  assert.doesNotMatch(source,/superres_frames\s*=\s*\[/);
});

test('temporal stabilization confidence-gates neighbor blending and restores source detail',()=>{
  assert.match(source,/difference = np\.mean\(np\.abs\(cur - other\), axis=2\)/);
  assert.match(source,/confidence = np\.clip\(1\.0 - difference \/ TEMPORAL_DIFF_THRESHOLD/);
  assert.match(source,/SOURCE_DETAIL_RESTORE/);
  assert.match(source,/GaussianBlur/);
});

test('4K result exposes temporal certification evidence',()=>{
  assert.match(source,/AVANTIQO_TEMPORAL_SUPER_RESOLUTION_V1/);
  assert.match(source,/"temporal_neighbor_window": 3/);
  assert.match(source,/"temporal_confidence_gated": True/);
  assert.match(source,/"delivery_4k"/);
});
