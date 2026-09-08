import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const worker = fs.readFileSync('services/avantiqo-video-engine/modal_native_job.py', 'utf8');

test('fast candidate wrapper accepts the distilled renderer minimum while native masters keep the 1MB floor', () => {
  assert.match(worker, /minimum_output_bytes = 500_000 if candidate_t2v else 1024 \* 1024/);
  assert.match(worker, /output_path\.stat\(\)\.st_size < minimum_output_bytes/);
});
