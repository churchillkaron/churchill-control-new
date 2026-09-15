import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('owned visual analyzer accepts validated in-memory frame data URIs',()=>{
 const s=fs.readFileSync('services/avantiqo-image-engine/handler_v2.py','utf8');
 assert.match(s,/if not _text\(source_image\)\.lower\(\)\.startswith\("data:image\/"\):/);
 assert.match(s,/source_image = legacy\._public_https_url\(source_image\)/);
});
