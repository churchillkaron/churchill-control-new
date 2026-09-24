import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const turn = fs.readFileSync("app/api/operator/turn/route.js", "utf8");
const resolver = fs.readFileSync("lib/people/runtime/resolveStaffPartyForOrganization.js", "utf8");
const backfill = fs.readFileSync("supabase/migrations/20260923052117_backfill_active_membership_parties.sql", "utf8");

test("Business Partner resolves Party identity per requested organization", () => {
  assert.match(turn, /resolveStaffPartyForOrganization/);
  assert.match(turn, /organizationId: access\.organizationId \|\| organizationId/);
  assert.doesNotMatch(turn, /const partyId =\s*access\.staff\?\.party_id/);
  assert.match(resolver, /employee_employment_assignments/);
  assert.match(resolver, /\.eq\("organization_id", organization\)/);
  assert.match(resolver, /\.ilike\("email", email\)/);
});

test("active authenticated membership backfill creates only missing organization Parties", () => {
  assert.match(backfill, /ou\.status = 'active'/);
  assert.match(backfill, /sa\.auth_user_id is not null/);
  assert.match(backfill, /not exists \([\s\S]*employee_employment_assignments/);
  assert.match(backfill, /not exists \([\s\S]*public\.parties/);
  assert.match(backfill, /insert into public\.parties/);
  assert.match(backfill, /update public\.staff_accounts/);
});
