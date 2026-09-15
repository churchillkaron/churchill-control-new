import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Avantiqo video preserves approved duration from output_spec before 5s fallback',()=>{
 const s=fs.readFileSync('lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js','utf8');
 assert.match(s,/input\.output_spec\?\.duration_seconds/);
 assert.match(s,/input\.requirements\?\.output_spec\?\.duration_seconds/);
 assert.match(s,/generation\.output_spec\?\.duration_seconds/);
 const fallback=s.indexOf('generation.output_spec?.duration_seconds');
 const five=s.indexOf('\n        5,',fallback);
 assert.ok(fallback>=0 && five>fallback);
});
