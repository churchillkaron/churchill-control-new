import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const master = await readFile(new URL('../lib/creative/director/runtime/CreativeMasterPlanRuntime.js', import.meta.url), 'utf8');
const worldClass = await readFile(new URL('../lib/creative/director/runtime/CreativeWorldClassConceptIntelligenceRuntime.js', import.meta.url), 'utf8');

test('semantic mission meaning is inferred from natural-language objectives when explicit flags are absent', () => {
  assert.match(master, /global_scale_required: required\("global_scale_required"\) \|\| inferred\.global_scale_required/);
  assert.match(master, /technology_ai_future_required: required\("technology_ai_future_required"\) \|\| inferred\.technology_ai_future_required/);
  assert.match(master, /core_mechanism_dramatization_required: required\("core_mechanism_dramatization_required"\) \|\| inferred\.core_mechanism_dramatization_required/);
});

test('temporal story architecture scenes are promoted before canonical validation', () => {
  assert.match(master, /if \(promotedSections\.scenes == null && storyArchitecture\.scenes != null\)/);
  assert.match(master, /promotedSections\.scenes = storyArchitecture\.scenes/);
});

test('premium benchmark films reject SaaS category literalism as the dramatic engine', () => {
  assert.match(worldClass, /PREMIUM_CATEGORY_LITERALISM_PATTERNS/);
  assert.match(worldClass, /premium_brand_category_literalism/);
  assert.match(master, /office stress, fragmented tools, dashboards\/UI, invoices, approvals, admin work and problem-product-relief arcs/);
});
