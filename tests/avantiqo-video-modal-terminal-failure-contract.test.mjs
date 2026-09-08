import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync('lib/platform/service-runtime/providers/avantiqo-owned/AvantiqoOwnedModalWorker.js','utf8');
assert.match(source,/terminalDirectCallError/);
assert.match(source,/call\.logs\.tail\(\{ entries: 120 \}\)/);
assert.match(source,/status: "failed"/);
assert.match(source,/MODAL_EXECUTION_FAILED/);
assert.match(source,/terminalError = await terminalDirectCallError\(call\)/);
console.log('AVANTIQO_VIDEO_MODAL_TERMINAL_FAILURE_CONTRACT=PASS');
