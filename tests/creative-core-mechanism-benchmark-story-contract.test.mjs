import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const registry = read('lib/creative/director/registry/CreativeMasterPlanContractRegistry.js');
const runtime = read('lib/creative/director/runtime/CreativeMasterPlanRuntime.js');

test('creative direction can make a differentiated core mechanism the cinematic protagonist', () => {
  assert.match(registry, /core_mechanism_dramaturgy/);
  assert.match(registry, /inputs enter it/);
  assert.match(registry, /dashboard demo/);
  assert.match(runtime, /core_mechanism_dramatization_required/);
  assert.match(runtime, /causal core must be dramatized as a story-bearing mechanism/);
});

test('global and future-facing missions cannot collapse to one generic software incident', () => {
  assert.match(registry, /scale_synthesis/);
  assert.match(runtime, /global_scale_required/);
  assert.match(runtime, /One generic office, one local incident or one software-use case is insufficient/);
  assert.match(runtime, /generic holograms, floating dashboards or blue network lines/);
});

test('benchmark floor calibrates authorship rather than internal contract compliance', () => {
  assert.match(registry, /benchmark_relative_authorship/);
  assert.match(registry, /ordinary beside the declared benchmark floor/);
  assert.match(runtime, /benchmark_floor/);
  assert.match(runtime, /Contract compliance is never a reason to award a world-class score/);
});
