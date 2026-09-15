import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('video analysis frame extraction retries earlier timestamps at the tail',()=>{
 const s=fs.readFileSync('lib/platform/service-runtime/providers/openai/OpenAIVideoAnalysisFrameRuntime.js','utf8');
 assert.match(s,/Number\(second\) - 0\.25/);
 assert.match(s,/Number\(second\) - 0\.75/);
 assert.match(s,/fs\.rmSync\(outputPath, \{ force: true \}\)/);
});
