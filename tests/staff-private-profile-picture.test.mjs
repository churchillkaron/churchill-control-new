import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const upload=fs.readFileSync(new URL('../app/api/staff/upload-profile-picture/route.js',import.meta.url),'utf8');
const read=fs.readFileSync(new URL('../app/api/staff/profile-picture/[staffId]/route.js',import.meta.url),'utf8');

test('profile picture upload is private and self scoped',()=>{
  assert.match(upload,/resolveAuthenticatedStaffContext/);
  assert.match(upload,/staff-profile-pictures/);
  assert.match(upload,/supabaseAdmin\.storage/);
  assert.match(upload,/upsert: true/);
  assert.match(upload,/`\/api\/staff\/profile-picture\/\$\{context\.staff\.id\}`/);
  assert.doesNotMatch(upload,/getPublicUrl/);
  assert.doesNotMatch(upload,/createServerSupabase/);
});

test('profile picture read is authenticated and organization scoped',()=>{
  assert.match(read,/resolveAuthenticatedStaffContext/);
  assert.match(read,/allowIncompleteActivation: true/);
  assert.match(read,/active_organization_id === context\.organizationId/);
  assert.match(read,/organization_users/);
  assert.match(read,/Profile picture access denied/);
  assert.match(read,/Cache-Control.*private/);
  assert.doesNotMatch(read,/getPublicUrl/);
});
