import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const upload = fs.readFileSync(new URL("../app/api/staff/upload-profile-picture/route.js", import.meta.url), "utf8");
const profile = fs.readFileSync(new URL("../app/(system)/staff/profile/page.jsx", import.meta.url), "utf8");
const profileRoute = fs.readFileSync(new URL("../app/api/staff/profile-overview/route.js", import.meta.url), "utf8");


test("profile photo upload is bound to authenticated staff and organization", () => {
  assert.match(upload, /resolveAuthenticatedStaffContext/);
  assert.match(upload, /requestedStaffId && requestedStaffId !== context\.staff\.id/);
  assert.match(upload, /eq\("active_organization_id", context\.organizationId\)/);
  assert.match(upload, /MAX_PROFILE_IMAGE_BYTES/);
  assert.match(upload, /image\/jpeg/);
  assert.match(upload, /image\/png/);
  assert.match(upload, /image\/webp/);
});

test("staff profile exposes own employment details with server-masked sensitive identifiers", () => {
  assert.match(profile, /\/api\/staff\/profile-overview/);
  assert.match(profile, /staff\.bank_account_masked/);
  assert.match(profile, /staff\.tax_id_masked/);
  assert.doesNotMatch(profile, /staff\.bank_account(?!_masked)/);
  assert.doesNotMatch(profile, /staff\.tax_id(?!_masked)/);
  assert.match(profile, /Changes that affect payroll, legal identity or employment terms remain governed management actions/);
});


test("profile overview masks banking and tax identifiers before the browser payload", () => {
  assert.match(profileRoute, /bank_account_masked: maskedIdentifier\(staff\.bank_account\)/);
  assert.match(profileRoute, /tax_id_masked: maskedIdentifier\(staff\.tax_id\)/);
  assert.match(profileRoute, /auth_linked: Boolean\(staff\.auth_user_id\)/);
  assert.doesNotMatch(profileRoute, /bank_account:\s*staff\.bank_account/);
  assert.doesNotMatch(profileRoute, /tax_id:\s*staff\.tax_id/);
  assert.match(profile, /staff\.bank_account_masked/);
  assert.match(profile, /staff\.tax_id_masked/);
  assert.match(profile, /staff\.auth_linked/);
  assert.doesNotMatch(profileRoute, /from\("parties"\)\.select\("\*"\)/);
  assert.doesNotMatch(profileRoute, /from\("employee_compensation_profiles"\)[\s\S]{0,80}\.select\("\*"\)/);
  assert.doesNotMatch(profileRoute, /from\("payroll_records"\)[\s\S]{0,80}\.select\("\*"\)/);
  assert.doesNotMatch(profileRoute, /from\("staff_schedules"\)[\s\S]{0,80}\.select\("\*"\)/);
  assert.doesNotMatch(profileRoute, /from\("staff_attendance"\)[\s\S]{0,80}\.select\("\*"\)/);
  assert.doesNotMatch(profile, /Staff ID/);
  assert.doesNotMatch(profile, /profile\.organizationId/);
  assert.doesNotMatch(profileRoute, /organizationId,\s*availableOrganizationIds/);
  assert.doesNotMatch(profileRoute, /id: staff\.id/);
  assert.doesNotMatch(profileRoute, /party_id: staff\.party_id/);
  assert.doesNotMatch(profileRoute, /id: partyResult\.data\.id/);
  assert.doesNotMatch(profileRoute, /id: currentEmployment\.id/);
  assert.doesNotMatch(profileRoute, /id: selectedProfile\.id/);
  assert.doesNotMatch(profileRoute, /id: currentEntity\.id/);
});
