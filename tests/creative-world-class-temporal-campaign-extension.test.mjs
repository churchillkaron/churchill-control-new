import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const source = await readFile(new URL('../lib/creative/director/runtime/CreativeWorldClassConceptIntelligenceRuntime.js', import.meta.url), 'utf8');
test('single temporal masters do not fail production concept approval on campaign packaging depth', () => {
  assert.match(source, /const temporalSingleMaster = text\(result\.plan\?\.workflow_kind\).*TEMPORAL/);
  assert.match(source, /required: !temporalSingleMaster/);
  assert.match(source, /if \(campaignExtensions\.required && campaignExtensions\.effective\.length < policy\.minimum_campaign_extensions\)/);
  assert.match(source, /campaign_extensions_required: campaignExtensions\.required/);
});
