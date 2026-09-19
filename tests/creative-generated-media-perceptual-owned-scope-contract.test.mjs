import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualGraphRuntime.js', import.meta.url), 'utf8');

test('perceptual review inherits only explicit shot references and never hardcodes OpenAI', () => {
  assert.match(source, /assets:\s*expectation\.reference_asset_ids/);
  assert.match(source, /provider:\s*null/);
  assert.match(source, /owned_only_required:\s*true/);
  assert.match(source, /external_provider_fallback_forbidden:\s*true/);
  assert.match(source, /story_lineage:\s*sourceNode\.metadata\?\.story_lineage/);
  assert.match(source, /workflow_kind:\s*sourceNode\.metadata\?\.workflow_kind/);
  assert.doesNotMatch(source, /provider:\s*["']openai["']/i);
  assert.doesNotMatch(source, /provider_prompt:\s*["']/i);
});
