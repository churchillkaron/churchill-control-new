import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('video analysis extracts lossless png frames before sharp normalization',()=>{
 const s=fs.readFileSync('lib/platform/service-runtime/providers/openai/OpenAIVideoAnalysisFrameRuntime.js','utf8');
 assert.match(s,/openai-review-frame-\$\{String\(offset \+ 1\).*\.png/);
 assert.doesNotMatch(s,/openai-review-frame-\$\{String\(offset \+ 1\).*\.jpg/);
});
