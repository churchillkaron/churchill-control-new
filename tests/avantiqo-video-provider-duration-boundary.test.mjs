import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('owned Node01 video provider and worker share the same bounded 1-8 second shot duration', () => {
  const registration=fs.readFileSync('lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js','utf8');
  const local=fs.readFileSync('lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoLocalQueueProvider.js','utf8');
  const worker=fs.readFileSync('scripts/local-node/avantiqo-node01-worker.ps1','utf8');
  assert.match(registration,/allowed_duration_seconds:\s*\[1, 8\]/);
  assert.match(registration,/max_duration_seconds:\s*8/);
  assert.match(local,/boundedInt\([^\n]*, 2, 1, 8\)/);
  assert.match(worker,/\[Math\]::Max\(1,\[Math\]::Min\(8,\$duration\)\)/);
});
