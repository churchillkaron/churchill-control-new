import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bootstrap=fs.readFileSync('app/api/session/bootstrap/route.js','utf8');
const provider=fs.readFileSync('app/providers/BusinessContextProvider.jsx','utf8');
const topbar=fs.readFileSync('components/workspace/WorkspaceTopBar.jsx','utf8');
const control=fs.readFileSync('app/api/platform/admin/control/route.js','utf8');
const home=fs.readFileSync('components/platform/PlatformOwnerHome.jsx','utf8');

test('platform owner exposes BEA as legal operator without making it tenant entity context',()=>{
  assert.match(bootstrap,/0835553004601/);
  assert.match(bootstrap,/operator_legal_entity: operatorLegalEntity/);
  assert.match(provider,/operator_legal_entity/);
  assert.match(topbar,/Legal operator/);
  assert.match(topbar,/isPlatformOperatorWorkspace \?/);
});

test('platform owner critical activity is platform-scoped while customer activity remains separate',()=>{
  assert.match(control,/row\.organization_id === access\.organizationId/);
  assert.match(control,/customerActivity/);
  assert.match(control,/row\.organization_id !== access\.organizationId/);
  assert.match(home,/control\?\.customerActivity/);
  assert.match(home,/customerActivity\.filter\(isOpenSignal\)/);
});
