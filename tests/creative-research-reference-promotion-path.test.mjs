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

test("selected page references are expanded into visual candidates before promotion", async () => {
  const source = fs.readFileSync("lib/creative/research/runtime/CreativeResearchReferencePromotionRuntime.js", "utf8");
  assert.match(source, /pageVisualCandidates/);
  assert.match(source, /_next\/image/);
  assert.match(source, /derived_from_page/);
  assert.match(source, /await resolvedSelectedReferences\(research\)/);
});

test('page visual promotion rejects tiny/decorative media and binds child assets to parent reference',()=>{
 assert.match(promotion,/ansatte\|employees\?\|staff\|people/);
 assert.match(promotion,/width > 0 && width < 640/);
 assert.match(promotion,/height > 0 && height < 480/);
 assert.match(promotion,/visual_reference_assets/);
 assert.match(promotion,/extracted_visual_asset_ids/);
 assert.match(promotion,/PROMOTED_PAGE_VISUALS_REFERENCE_ONLY/);
});
