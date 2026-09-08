import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const worker = fs.readFileSync('services/avantiqo-video-engine/modal_native_job.py', 'utf8');

test('plain Studio text-to-video uses one distilled candidate render instead of native 4K', () => {
  assert.match(worker, /from modal_investor_t2v import generate_investor_t2v_master/);
  assert.match(worker, /candidate_t2v = job\["capability"\] == "ai\.video\.generate"/);
  assert.match(worker, /generate_investor_t2v_master\.remote\(output_relative/);
  assert.match(worker, /candidate-master-1920x1088\.mp4/);
  assert.match(worker, /"master_promotion_required": candidate_t2v/);
  assert.match(worker, /"automatic_generation_retries": 0/);
  assert.doesNotMatch(worker, /else:\s*generation = generate_native_master\.remote\(""/);
});
