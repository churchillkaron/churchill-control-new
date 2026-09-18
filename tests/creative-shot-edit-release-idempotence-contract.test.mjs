import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const release=fs.readFileSync('lib/creative/post-production/runtime/CreativeShotEditReleaseRuntime.js','utf8');
const queue=fs.readFileSync('lib/creative/production/queue/runtime/ProductionQueueRuntime.js','utf8');

test('shot edit release tracks new releases separately from existing canonical releases',()=>{
  assert.match(release,/const released=\[\];const existing=\[\];/);
  assert.match(release,/if\(shotAlreadyReleased\)\{existing\.push\(shot\);continue;\}/);
  assert.match(release,/release_count:released\.length/);
  assert.match(release,/existing_count:existing\.length/);
});

test('canonical edit-source metadata is updated only when state differs',()=>{
  assert.match(release,/const desired=\{/);
  assert.match(release,/const current=\{/);
  assert.match(release,/if\(!same\(current,desired\)\)/);
  assert.match(release,/updated_asset_node_ids\.push\(candidate\.id\)/);
});

test('production graph is not rewritten when reconciliation is unchanged',()=>{
  assert.match(release,/const before=\{nodes:graph\.nodes,edges:graph\.edges,metadata:graph\.metadata\}/);
  assert.match(release,/graph_changed=!same\(before,after\)/);
  assert.match(release,/if\(graph_changed\)\{/);
});

test('release runtime exposes a true change flag only for real state mutation',()=>{
  assert.match(release,/changed:released\.length>0\|\|updated_asset_node_ids\.length>0\|\|graph_changed/);
});

test('central queue progresses on release mutations, not on already released shots',()=>{
  assert.match(queue,/if \(shotEditRelease\.changed === true\) progressed = true/);
  assert.doesNotMatch(queue,/if \(shotEditRelease\.release_count\) progressed = true/);
});
