import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const login = fs.readFileSync("app/login/page.js", "utf8");
const callback = fs.readFileSync("app/login/callback/page.js", "utf8");
const publicPage = fs.readFileSync("app/staff-portal/page.jsx", "utf8");
const start = fs.readFileSync("app/start/page.jsx", "utf8");
const provision = fs.readFileSync("lib/people/employees/provisionStaffAccess.js", "utf8");

test("staff has an explicit login intent and title", () => {
  assert.match(login, /requestedPortal === "staff"/);
  assert.match(login, /"Staff Login"/);
  assert.match(login, /Secure access to your employer Staff Portal/);
});

test("staff login resolves to Staff Portal and never falls into owner onboarding", () => {
  assert.match(callback, /requestedPortal\(\) === "staff"/);
  assert.match(callback, /return "\/staff"/);
  assert.match(callback, /\/staff-portal\?access=required/);
  assert.doesNotMatch(callback, /browserPortalIntent/);
});

test("public Staff Portal and Start router point employees to Staff Login", () => {
  assert.match(publicPage, /\/login\?portal=staff/);
  assert.match(publicPage, /Employees join through their employer/);
  assert.match(start, /href:"\/login\?portal=staff"/);
});

test("staff provisioning remains employer-scoped and creates employee relationship", () => {
  assert.match(provision, /relationship_type: "employee"/);
  assert.match(provision, /active_organization_id: organizationId/);
  assert.match(provision, /organization_users/);
});

test("new staff password setup is explicitly staff-scoped from the invitation email", () => {
  const route = fs.readFileSync("app/api/users/create/route.js", "utf8");
  assert.match(route, /\/login\?portal=staff#type=recovery/);
  assert.doesNotMatch(route, /new URL\(\s*"\/login#type=recovery"/);
});

test("staff activation requires a canonical legal employer assignment", () => {
  const runtime = fs.readFileSync("lib/people/workforce/StaffActivationRuntime.js", "utf8");
  const projection = fs.readFileSync("lib/people/portal/StaffActivationProjection.js", "utf8");
  const setup = fs.readFileSync("components/staff/StaffActivationSetup.jsx", "utf8");

  assert.match(runtime, /employee_employment_assignments/);
  assert.match(runtime, /legal_entities/);
  assert.match(runtime, /employmentAssigned/);
  assert.match(runtime, /const complete = employmentAssigned && emailVerified && phoneVerified && identityVerified && passkeyVerified/);
  assert.match(projection, /employment:/);
  assert.match(setup, /title="Legal employer"/);
  assert.match(setup, /cannot be selected by the employee/);
  assert.match(setup, /Waiting for Owner \/ HR to assign your legal employer/);
});

test("People Directory activation email preserves Staff Portal recovery intent", () => {
  const route = fs.readFileSync("app/api/people/directory/route.js", "utf8");
  assert.match(route, /\/login\?portal=staff#type=recovery/);
  assert.doesNotMatch(route, /"\/login#type=recovery"/);
});

test("legal employer activation follows the current organization role", () => {
  const runtime = fs.readFileSync("lib/people/workforce/StaffActivationRuntime.js", "utf8");
  const route = fs.readFileSync("app/api/staff/activation/route.js", "utf8");
  assert.match(runtime, /EMPLOYMENT_BYPASS_ROLES = new Set\(\["OWNER", "ORGANIZATION_OWNER", "PLATFORM_OWNER"\]\)/);
  assert.match(runtime, /const role = normalizedRole\(accessRole \|\| staff\?\.role\)/);
  assert.match(runtime, /status: employmentBypass \? "OWNER_BYPASS" : employment\.status/);
  assert.match(route, /role: context\.role/);
});

test("staff access creation rejects malformed email before provisioning", () => {
  const route = fs.readFileSync("app/api/users/create/route.js", "utf8");
  const invalidIndex = route.indexOf("Staff email is invalid");
  const provisionIndex = route.indexOf("provisionStaffAccess({");
  assert.ok(invalidIndex >= 0 && provisionIndex > invalidIndex);
  assert.match(route, /validEmail/);
});

test("staff provisioning reuses one global Staff identity across employers", () => {
  assert.match(provision, /\.from\("staff_accounts"\)[\s\S]*\.ilike\("email", normalizedEmail\)[\s\S]*\.limit\(2\)/);
  assert.match(provision, /Multiple Staff identities use this email/);
  assert.match(provision, /sameActiveOrganization/);
  assert.match(provision, /ensureMembership\(\{[\s\S]*organizationId,[\s\S]*staffAccountId: staff\.id/);
  assert.match(provision, /Authentication user is already linked to another Staff identity/);
  assert.doesNotMatch(provision, /\.eq\("auth_user_id", authUser\.id\)[\s\S]{0,120}\.eq\("active_organization_id", organizationId\)/);
});

test("adding a second employer does not overwrite the Staff current organization role or Party", () => {
  assert.match(provision, /if \(staff\.active === false \|\| !staff\.active_organization_id\)/);
  assert.match(provision, /else if \(sameActiveOrganization\)/);
  const multiOrgBranch = provision.slice(
    provision.indexOf("const sameActiveOrganization"),
    provision.indexOf("await ensureEmployeeRelationship")
  );
  assert.doesNotMatch(multiOrgBranch, /else \{[\s\S]*updates\.active_organization_id = organizationId/);
});

test("staff organization switch resolves the selected organization Party and never carries the previous Party blindly", () => {
  const route = fs.readFileSync("app/api/session/organization/route.js", "utf8");
  assert.match(route, /resolveStaffPartyForOrganization/);
  assert.match(route, /employee_employment_assignments/);
  assert.match(route, /Multiple employment Party identities exist for this Staff account/);
  assert.match(route, /Multiple Party identities match this Staff email in the selected organization/);
  assert.match(route, /active_organization_id: context\.organizationId,[\s\S]*party_id: selectedPartyId,[\s\S]*role: context\.role \|\| null/);
});

test("staff directory and deactivation are organization membership scoped", () => {
  const route = fs.readFileSync("app/api/users/create/route.js", "utf8");
  assert.match(route, /membershipByStaffId/);
  assert.match(route, /organization_role: membership\?\.role \|\| row\.role \|\| null/);
  assert.match(route, /\.from\("organization_users"\)[\s\S]*\.update\(\{ status: body\.active \? "active" : "inactive" \}\)/);
  assert.match(route, /const hasActiveMembership = \(activeMemberships\.data \|\| \[\]\)\.length > 0/);
  assert.match(route, /const nextGlobalActive = membership[\s\S]*\? hasActiveMembership[\s\S]*: body\.active/);
});

test("stale persisted organization preference cannot override current Staff memberships", () => {
  const runtime = fs.readFileSync("lib/people/runtime/resolveAuthenticatedStaffContext.js", "utf8");
  assert.match(runtime, /authoritativeOrganizationId/);
  assert.match(runtime, /safePersistedOrganizationId/);
  assert.match(runtime, /persistedOrganizationId && availableOrganizationIds\.includes\(persistedOrganizationId\)/);
  assert.match(runtime, /authoritativeOrganizationId &&[\s\S]*!availableOrganizationIds\.includes\(authoritativeOrganizationId\)/);
});

test("concurrent Staff creation converges on the same global Staff identity", () => {
  assert.match(provision, /inserted\.error\?\.code === "23505"/);
  assert.match(provision, /Concurrent Staff identity creation could not be resolved safely/);
  assert.match(provision, /\.ilike\("email", normalizedEmail\)[\s\S]*\.limit\(2\)/);
});

test("concurrent Staff Auth creation and linking converge without duplicate identities", () => {
  assert.match(provision, /const racedUser = await findAuthUserByEmail\(normalizedEmail\)/);
  assert.match(provision, /String\(observed\.data\?\.auth_user_id \|\| ""\) === String\(authUser\.id\)/);
  assert.match(provision, /Authentication user is already linked to another Staff identity/);
  assert.match(provision, /\.is\("auth_user_id", null\)/);
});

test("concurrent organization membership creation reuses the raced membership", () => {
  assert.match(provision, /inserted\.error\?\.code !== "23505"/);
  assert.match(provision, /const raced = await supabaseAdmin[\s\S]*\.from\("organization_users"\)/);
  assert.match(provision, /raced\.data\.status !== "active"/);
  assert.match(provision, /return raced\.data\.id/);
});

test("Staff My Day evidence is private and previewable only through assigned-work authority", () => {
  const route = fs.readFileSync("app/api/staff/my-day/evidence/route.js", "utf8");
  assert.match(route, /const BUCKET = "service-evidence"/);
  assert.match(route, /storage:\/\/\$\{BUCKET\}/);
  assert.match(route, /createSignedUrl\(path, PREVIEW_SECONDS\)/);
  assert.match(route, /\.eq\("organization_id", context\.organizationId\)/);
  assert.match(route, /\.eq\("assigned_to", context\.staff\.id\)/);
  assert.match(route, /Evidence does not belong to this assigned work order/);
  assert.doesNotMatch(route, /\.from\("uploads"\)/);
  assert.doesNotMatch(route, /getPublicUrl/);
});

test("Staff profile picture upload is authenticated self-only and file constrained", () => {
  const route = fs.readFileSync("app/api/staff/upload-profile-picture/route.js", "utf8");
  assert.match(route, /resolveAuthenticatedStaffContext/);
  assert.match(route, /String\(staff_id\) !== String\(context\.staff\.id\)/);
  assert.match(route, /You can only update your own Staff profile picture/);
  assert.match(route, /PROFILE_TYPES/);
  assert.match(route, /MAX_PROFILE_BYTES/);
  assert.match(route, /PROFILE_BUCKET = "staff-profile-pictures"/);
  assert.match(route, /\$\{context\.organizationId\}\/\$\{staff_id\}\/profile/);
  assert.match(route, /\/api\/staff\/profile-picture\/\$\{encodeURIComponent\(String\(staff_id\)\)\}/);
  assert.doesNotMatch(route, /getPublicUrl/);
  assert.doesNotMatch(route, /\.from\([\s\S]*"uploads"[\s\S]*\)\.upload/);
  assert.match(route, /status: 403/);
  assert.match(route, /status: 415/);
  assert.match(route, /status: 413/);
});

test("legacy Staff migration HTTP routes are disabled", () => {
  const preview = fs.readFileSync("app/api/staff/migration-preview/route.js", "utf8");
  const run = fs.readFileSync("app/api/staff/migration-run/route.js", "utf8");
  for (const route of [preview, run]) {
    assert.match(route, /status: 404/);
    assert.doesNotMatch(route, /previewStaffPartyMigration/);
    assert.doesNotMatch(route, /migrateStaffAccountsToParty/);
  }
});

test("organization management RLS authority is scoped to the target organization membership role", () => {
  const migration = fs.readFileSync("supabase/migrations/20260923023303_staff_membership_scoped_rls_authority.sql", "utf8");
  assert.match(migration, /ou\.organization_id = target_organization_id/);
  assert.match(migration, /ou\.status = 'active'/);
  assert.match(migration, /upper\(coalesce\(ou\.role, ''\)\) in \('OWNER', 'ORGANIZATION_OWNER', 'ORG_OWNER', 'PLATFORM_OWNER', 'SUPER_ADMIN', 'MANAGER'\)/);
  assert.doesNotMatch(migration, /upper\(coalesce\(sa\.role/);
  assert.match(migration, /revoke all on function public\.can_manage_organization\(uuid\) from public, anon/);
  assert.match(migration, /revoke all on function public\.current_staff_account_id\(\) from public, anon/);
  assert.match(migration, /grant execute on function public\.current_staff_account_id\(\) to authenticated, service_role/);
});

test("payroll and same-organization RLS helpers use target membership and active Staff identity", () => {
  const migration = fs.readFileSync("supabase/migrations/20260923023303_staff_membership_scoped_rls_authority.sql", "utf8");
  assert.match(migration, /create or replace function public\.can_read_organization_payroll/);
  assert.match(migration, /upper\(coalesce\(ou\.role, ''\)\) in \('OWNER', 'ORGANIZATION_OWNER', 'ORG_OWNER', 'PLATFORM_OWNER', 'SUPER_ADMIN', 'MANAGER', 'ACCOUNTING'\)/);
  assert.match(migration, /revoke all on function public\.can_read_organization_payroll\(uuid\) from public, anon/);
  assert.match(migration, /create or replace function public\.same_organization/);
  assert.match(migration, /coalesce\(sa\.active, true\) = true/);
  assert.match(migration, /revoke all on function public\.same_organization\(uuid\) from public, anon/);
});

test("Staff identity table is read-only to browser roles and server-owned for mutations", () => {
  const migration = fs.readFileSync("supabase/migrations/20260923023303_staff_membership_scoped_rls_authority.sql", "utf8");
  const profileRoute = fs.readFileSync("app/api/staff/upload-profile-picture/route.js", "utf8");
  assert.match(migration, /drop policy if exists staff_accounts_manage/);
  assert.match(migration, /revoke all on table public\.staff_accounts from anon/);
  assert.match(migration, /revoke insert, update, delete on table public\.staff_accounts from authenticated/);
  assert.match(migration, /grant select on table public\.staff_accounts to authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table public\.staff_accounts to service_role/);
  assert.match(profileRoute, /supabaseAdmin[\s\S]*\.from\([\s\S]*"staff_accounts"/);
});

test("shared public uploads bucket cannot be written directly by browser or anonymous roles", () => {
  const migration = fs.readFileSync("supabase/migrations/20260923024638_uploads_bucket_direct_write_lockdown.sql", "utf8");
  const profile = fs.readFileSync("app/api/staff/upload-profile-picture/route.js", "utf8");
  const voice = fs.readFileSync("app/api/messages/voice-note/route.js", "utf8");
  const attachment = fs.readFileSync("app/api/messages/upload-attachment/route.js", "utf8");
  const asset = fs.readFileSync("app/api/assets/upload-file/route.js", "utf8");
  assert.match(migration, /drop policy if exists "Public upload uploads bucket" on storage\.objects/);
  assert.match(migration, /drop policy if exists "Authenticated upload uploads bucket" on storage\.objects/);
  for (const route of [profile, voice, attachment, asset]) {
    assert.match(route, /supabaseAdmin/);
    assert.doesNotMatch(route, /createServerSupabase/);
  }
});

test("Staff identity and work-permit review queues follow active organization membership, not selected context", () => {
  const identityRuntime = fs.readFileSync("lib/people/workforce/StaffIdentityVerificationRuntime.js", "utf8");
  const permitRuntime = fs.readFileSync("lib/people/workforce/StaffWorkPermitRuntime.js", "utf8");

  for (const runtime of [identityRuntime, permitRuntime]) {
    assert.match(runtime, /\.from\("organization_users"\)/);
    assert.match(runtime, /\.eq\("organization_id", organizationId\)/);
    assert.match(runtime, /\.eq\("status", "active"\)/);
    assert.match(runtime, /membershipByStaffId/);
    assert.match(runtime, /organization_role: membership\?\.role \|\| row\.role \|\| null/);
  }

  const identityQueue = identityRuntime.slice(
    identityRuntime.indexOf("export async function loadIdentityVerificationQueue"),
    identityRuntime.indexOf("export async function createIdentityReviewSignedUrl")
  );
  const permitQueue = permitRuntime.slice(
    permitRuntime.indexOf("export async function loadWorkPermitReviewQueue"),
    permitRuntime.indexOf("export async function createWorkPermitReviewSignedUrl")
  );
  assert.doesNotMatch(identityQueue, /\.eq\("active_organization_id", organizationId\)/);
  assert.doesNotMatch(permitQueue, /\.eq\("active_organization_id", organizationId\)/);
});

test("Staff profile picture dynamic route awaits App Router params", () => {
  const route = fs.readFileSync("app/api/staff/profile-picture/[staffId]/route.js", "utf8");
  assert.match(route, /const \{ staffId: rawStaffId \} = await params/);
  assert.match(route, /resolveAuthenticatedStaffContext/);
});
