import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../lib/creative/director/runtime/CreativeUniversalTemporalDirectionRuntime.js', import.meta.url), 'utf8');

test('resumed temporal masters receive universal dossier governance without new direction', () => {
  assert.match(source, /export function ensureUniversalTemporalDossier/);
  assert.match(source, /reuse_policy: "NO_REUSE_UNLESS_EXPLICITLY_APPROVED"/);
  assert.match(source, /dry_run_dossier_required_before_paid_generation: true/);
  assert.match(source, /concept_candidates: candidates/);
  assert.match(source, /selected_concept_id: selectedId \|\| null/);
  assert.match(source, /if \(temporal\.reused_approved_master === true\) \{\s*const reusedPlan = ensureUniversalTemporalDossier/);
});
