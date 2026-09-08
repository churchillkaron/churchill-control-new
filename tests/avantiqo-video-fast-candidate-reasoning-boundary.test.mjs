import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const worker=fs.readFileSync('services/avantiqo-video-engine/modal_native_job.py','utf8');
test('successful owned video jobs explicitly preserve the reasoning boundary',()=>{
  const success=worker.slice(worker.indexOf('return {', worker.indexOf('controlled_evidence =')),
    worker.indexOf('finally:', worker.indexOf('controlled_evidence =')));
  assert.match(success,/"raw_reasoning_persisted": False/);
});
