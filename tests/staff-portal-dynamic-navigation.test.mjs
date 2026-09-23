import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(new URL("../lib/people/portal/StaffPortalNavigationRuntime.js", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/api/staff/navigation/route.js", import.meta.url), "utf8");
const layout = fs.readFileSync(new URL("../app/(system)/staff/layout.jsx", import.meta.url), "utf8");

test("staff portal keeps standard self-service navigation separate from operational modules", () => {
  assert.match(runtime, /STAFF_PORTAL_STANDARD_NAVIGATION/);
  assert.match(runtime, /My Work/);
  assert.match(runtime, /Availability/);
  assert.match(runtime, /Requests/);
  assert.match(runtime, /Earnings/);
  assert.match(runtime, /operational/);
});

test("operational staff navigation is derived from effective organization permissions on the server", () => {
  assert.match(route, /resolveAuthenticatedStaffContext/);
  assert.match(route, /context\.organizationId/);
  assert.match(route, /context\.permissions/);
  assert.match(runtime, /permissions_applied_server_side: true/);
  assert.match(runtime, /hasAnyPermission/);
});

test("organization membership can explicitly hide or allow portal operational modules", () => {
  assert.match(runtime, /staff_portal_modules/);
  assert.match(runtime, /staff_portal_hidden_modules/);
  assert.match(runtime, /explicitDeny\.includes/);
  assert.match(runtime, /explicitAllow\.includes/);
});

test("staff client layout consumes server-approved navigation instead of a fixed operational menu", () => {
  assert.match(layout, /\/api\/staff\/navigation/);
  assert.match(layout, /navigation\.standard/);
  assert.match(layout, /navigation\.operational/);
});

test("staff navigation browser payload exposes only organization id/name after server-side permission resolution", () => {
  assert.match(route, /organizations: \(organizationsResult\.data \|\| \[\]\)\.map/);
  assert.match(route, /id: organization\.id/);
  assert.match(route, /name: organization\.name \|\| "Organization"/);
  assert.doesNotMatch(route, /permissionSources:/);
  assert.doesNotMatch(route, /selectionSource:/);
  assert.doesNotMatch(layout, /organization\.industry/);
});

const permissionRuntime = fs.readFileSync(new URL("../lib/people/portal/StaffPortalPermissionRuntime.js", import.meta.url), "utf8");

test("staff portal resolves actual general, operations and finance permission authorities", () => {
  assert.match(permissionRuntime, /role_permissions/);
  assert.match(permissionRuntime, /user_operations_roles/);
  assert.match(permissionRuntime, /operations_role_permissions/);
  assert.match(permissionRuntime, /user_finance_roles/);
  assert.match(permissionRuntime, /finance_permissions/);
  assert.match(route, /resolveStaffPortalEffectivePermissions/);
});

test("legacy operational modules such as POS and inventory still map into portal work surfaces", () => {
  assert.match(runtime, /"pos"/);
  assert.match(runtime, /"inventory"/);
  assert.match(runtime, /"finance"/);
});

test("generic POS access is constrained to a POS-only work surface and organization industry", () => {
  assert.match(runtime, /key: "pos"/);
  assert.match(runtime, /route: "operations\/pos"/);
  assert.match(runtime, /permissions: \["pos", "pos\.\*", "billing"\]/);
  assert.match(runtime, /industryMatched/);
});

test("multi-organization staff can switch only through server-validated organization context", () => {
  assert.match(route, /export async function POST/);
  assert.match(route, /resolveAuthenticatedStaffContext\(\{ request, organizationId, allowIncompleteActivation: true \}\)/);
  assert.match(route, /availableOrganizationIds/);
  assert.match(route, /context\.organizationId/);
  assert.match(route, /avantiqo_active_organization_id/);
  assert.match(route, /httpOnly: true/);
  assert.match(layout, /Active organization/);
  assert.match(layout, /switchOrganization/);
});

test("canonical staff role and department route workers to exact operational surfaces without granting unrelated domains", () => {
  assert.match(runtime, /ROLE_OPERATIONAL_SURFACES/);
  assert.match(runtime, /roles: \["WAITER", "CASHIER", "FOH"\]/);
  assert.match(runtime, /route: "operations\/kitchen"/);
  assert.match(runtime, /route: "operations\/bar"/);
  assert.match(runtime, /route: "operations\/front-desk"/);
  assert.match(runtime, /route: "operations\/housekeeping"/);
  assert.match(runtime, /source: "role_context"/);
  assert.match(runtime, /operationalByKey/);
});

test("standard staff portal includes authenticated self-service profile and personal documents", () => {
  assert.match(runtime, /key: "profile"/);
  assert.match(runtime, /href: "\/staff\/profile"/);
  assert.match(runtime, /key: "my-documents"/);
  assert.match(runtime, /href: "\/staff\/documents"/);
});


test("field-service technician roles land on the self-scoped technician cockpit rather than dispatch control", () => {
  assert.match(runtime, /label: "My Field Work"/);
  assert.match(runtime, /route: "operations\/field-service\/technician"/);
  assert.match(runtime, /roles: \["TECHNICIAN", "FIELD_TECHNICIAN", "OPERATOR"\]/);
});


test("broad Operations control requires management authority rather than view-only operator access", () => {
  assert.match(runtime, /permissions: \["operations\.\*", "operations\.manage", "operations\.control"/);
  assert.doesNotMatch(runtime, /permissions: \[[^\]]*"operations\.view"[^\]]*\]/);
});
