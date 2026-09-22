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
