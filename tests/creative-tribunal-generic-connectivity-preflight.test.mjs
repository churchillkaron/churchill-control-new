import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js', import.meta.url), 'utf8');
test('deterministic anti-cliche gate also rejects generic glowing connectivity metaphors', () => {
  assert.match(source, /genericGlowingConnectivity/);
  assert.match(source, /glowing blue line\/thread\/path/);
  assert.match(source, /logo-swappable technology metaphor/);
  assert.match(source, /mission-specific visual mechanism/);
});
test('deterministic anti-cliche gate rejects generic abstract light anchors', () => {
  assert.match(source, /genericAbstractLightAnchor/);
  assert.match(source, /abstract light anchor\/beacon\/orb/);
  assert.match(source, /concrete business relationship/);
});
test('deterministic anti-cliche gate rejects generic abstract light-core forms', () => {
  assert.match(source, /genericAbstractLightForm/);
  assert.match(source, /harmonic core/);
});


test('deterministic anti-cliche gate rejects generic abstract wave/current/flow metaphors', () => {
  assert.match(source, /genericAbstractWaveFlow/);
  assert.match(source, /abstract harmonic\/resonance waves/);
  assert.match(source, /observable business relationship/);
});
