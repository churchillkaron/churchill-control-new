import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source = fs.readFileSync(new URL('../lib/platform/service-runtime/providers/AvantiqoLocalComputeEnqueueRuntime.js', import.meta.url), 'utf8');
test('only stale Video Studio cancellations are requeued idempotently', () => {
  assert.match(source, /STALE_VIDEO_STUDIO_RESUME_CANCELLED/);
  assert.match(source, /\.eq\("execution_key", executionKey\)/);
  assert.match(source, /\.eq\("request_hash", requestHash\)/);
  assert.match(source, /status: "QUEUED"/);
  assert.match(source, /attempts: 0/);
  assert.match(source, /stale_resume_requeued: staleResumeCancelled/);
  assert.doesNotMatch(source, /\["FAILED", "CANCELLED"\]/);
});
