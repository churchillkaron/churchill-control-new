import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const research=fs.readFileSync('lib/creative/research/runtime/ResearchRuntime.js','utf8');
const promotion=fs.readFileSync('lib/creative/research/runtime/CreativeResearchReferencePromotionRuntime.js','utf8');
const orchestrator=fs.readFileSync('lib/creative/director/orchestrator/CreativePipelineOrchestrator.js','utf8');
test('selected direct visual research references become governed reference-only Creative Assets before direction',()=>{
 assert.match(research,/CreativeResearchReferencePromotionRuntime\.promote/);
 assert.match(promotion,/selection_status\)\.toUpperCase\(\) === "SELECTED"/);
 assert.match(promotion,/reference_only: true/);
 assert.match(promotion,/approved_for_reuse: false/);
 assert.match(promotion,/publication_authority: false/);
 assert.match(promotion,/creative_asset_id/);
});
test('temporal orchestrator resolves research before creating temporal direction',()=>{
 const researchIndex=orchestrator.indexOf('ResearchRuntime.resolveCreativeDirectionResearch');
 const directionIndex=orchestrator.indexOf('CreativeUniversalTemporalDirectionRuntime.create', researchIndex);
 assert.ok(researchIndex > 0 && directionIndex > researchIndex);
 assert.match(orchestrator,/assets: directionAssets/);
});
