import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const edit=await readFile('scripts/record-avantiqo-music-edit-human-review-local.mjs','utf8');
const promotion=await readFile('scripts/plan-avantiqo-music-transform-promotion.mjs','utf8');
test('Edit human review requires six scored criteria and 92 average for approval',()=>{
  assert.match(edit,/REVIEW_SCORES_REQUIRED/);
  assert.match(edit,/scores\.length!==6/);
  assert.match(edit,/averageScore<92/);
  assert.match(edit,/minimum_average_score:92/);
  assert.match(edit,/automatic_human_approval_forbidden:true/);
  assert.match(edit,/production_activation_allowed:false/);
});
test('Transform promotion binds exact benchmark and human review evidence',()=>{
  assert.match(promotion,/AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_BENCHMARK_V3/);
  assert.match(promotion,/BENCHMARK_JOB_BINDING_REQUIRED/);
  assert.match(promotion,/SCORED_HUMAN_REVIEW_REQUIRED/);
  assert.match(promotion,/HUMAN_REVIEW_AVERAGE_92_REQUIRED/);
  assert.match(promotion,/ai\.audio\.edit/);
  assert.match(promotion,/ai\.audio\.remix/);
  assert.match(promotion,/ai\.audio\.extend/);
});
test('Transform promotion is plan-only and never mutates activation',()=>{
  assert.match(promotion,/mode:'PLAN_ONLY'/);
  assert.match(promotion,/apply_requires_explicit_operator_approval:true/);
  assert.match(promotion,/provider_certification_mutation_performed:false/);
  assert.match(promotion,/production_routing_mutation_performed:false/);
  assert.match(promotion,/pricing_activation_performed:false/);
  assert.match(promotion,/production_deploy_performed:false/);
  assert.match(promotion,/activation_allowed_without_explicit_operator_approval:false/);
});
