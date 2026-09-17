import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('professional release stops after source generation before fast mastering', () => {
  const source = fs.readFileSync('lib/creative/music/runtime/CreativeMusicWorldClassExecutionRuntime.js', 'utf8');
  const professionalGate = source.indexOf('if (professionalReleaseRequested && sourceAsset)');
  const mastering = source.indexOf('CreativeMusicFinishingRuntime.ensureMasters', professionalGate);
  assert.ok(professionalGate > 0);
  assert.ok(mastering > professionalGate);
  const earlyReturn = source.indexOf('professional_next_stage: professionalNext', professionalGate);
  assert.ok(earlyReturn > professionalGate && earlyReturn < mastering);
});

test('normal Music Studio compose routes Professional Release through world-class execution', () => {
  const route = fs.readFileSync('app/api/creative/music/studio/route.js', 'utf8');
  assert.match(route, /executeWorldClassMusicStudio/);
  assert.match(route, /production_standard:\s*"PROFESSIONAL_RELEASE"/);
  assert.match(route, /commercial_release:\s*true/);
});
