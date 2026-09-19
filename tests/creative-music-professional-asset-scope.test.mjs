import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const files=[
 'lib/creative/music/runtime/CreativeMusicProfessionalContinuationRuntime.js',
 'lib/creative/music/runtime/CreativeMusicProfessionalStemRuntime.js',
 'lib/creative/music/runtime/CreativeMusicProfessionalVocalProductionRuntime.js',
 'lib/creative/music/runtime/CreativeMusicProfessionalMixRuntime.js',
 'lib/creative/music/runtime/CreativeMusicProfessionalFinalizationRuntime.js',
 'app/api/creative/music/professional-release/route.js',
];
test('professional release resolves project scope from canonical asset metadata',()=>{
 for(const file of files){ const source=fs.readFileSync(file,'utf8'); assert.match(source,/assetProjectId/); assert.doesNotMatch(source,/text\((sourceAsset|mixAsset|corrected|candidate|asset)\.creative_project_id\)/); }
});
