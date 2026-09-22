import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync("app/(system)/onboarding/page.jsx", "utf8");
const provision = fs.readFileSync("lib/onboarding/provisionOrganization.js", "utf8");
const builder = fs.readFileSync("lib/onboarding/buildWorkspaceFromTemplate.js", "utf8");
const industriesRoute = fs.readFileSync("app/api/onboarding/industries/route.js", "utf8");
const provisionRoute = fs.readFileSync("app/api/onboarding/provision/route.js", "utf8");

test("onboarding UI loads governed industry options instead of a hard-coded industry list", () => {
  assert.match(page, /fetch\("\/api\/onboarding\/industries"/);
  assert.match(page, /setIndustries\(options\)/);
  assert.doesNotMatch(page, /const INDUSTRIES\s*=\s*\[/);
  assert.doesNotMatch(page, /value:\s*"agency"/);
});

test("industry authority is authenticated and sourced from governed templates", () => {
  assert.match(industriesRoute, /getServerCurrentUser/);
  assert.match(industriesRoute, /getOnboardingIndustryOptions/);
  assert.match(industriesRoute, /status:401/);
});

test("provision validates governed industry and owner identity before organization creation", () => {
  const validateIndex = provision.indexOf("requireOnboardingIndustry(industry)");
  const ownerIndex = provision.indexOf("resolveOwnerAccount({ ownerEmail, authUserId })");
  const createIndex = provision.indexOf("createOrganization({");
  assert.ok(validateIndex >= 0 && validateIndex < createIndex);
  assert.ok(ownerIndex >= 0 && ownerIndex < createIndex);
});

test("organization type comes from governed onboarding industry when not explicitly supplied", () => {
  assert.match(provision, /onboardingIndustry\.organizationType/);
});

test("workspace template installation only accepts ACTIVE templates", () => {
  assert.match(builder, /\.eq\("status", "ACTIVE"\)/);
});

test("provision API requires an authenticated user", () => {
  assert.match(provisionRoute, /getServerCurrentUser/);
  assert.match(provisionRoute, /AUTHENTICATION_REQUIRED/);
});


test("organization stays non-active until complete onboarding succeeds", () => {
  assert.match(provision, /status: "provisioning"/);
  assert.match(provision, /organizationStatus: "PROVISIONING"/);
  const workspaceIndex = provision.indexOf("buildWorkspaceFromTemplate({");
  const activationIndex = provision.indexOf('organization_status: "ACTIVE"');
  assert.ok(workspaceIndex >= 0 && activationIndex > workspaceIndex);
});

test("failed onboarding marks the organization failed and restores prior active organization", () => {
  assert.match(provision, /organization_status: "SETUP_FAILED"/);
  assert.match(provision, /active_organization_id: previousActiveOrganizationId/);
});

test("signup propagates business versus accounting-firm intent through auth metadata", () => {
  const signup = fs.readFileSync("app/signup/page.jsx", "utf8");
  const complete = fs.readFileSync("app/signup/complete/page.jsx", "utf8");
  const owner = fs.readFileSync("app/api/onboarding/self-service-owner/route.js", "utf8");
  assert.match(signup, /avantiqo_signup_intent:intent/);
  assert.match(signup, /signup\/complete\?intent=/);
  assert.match(complete, /onboarding\?intent=/);
  assert.match(owner, /requestedIntent !== metadataIntent/);
});

test("accounting-firm onboarding is fixed to the governed accounting_firm template", () => {
  assert.match(page, /signupIntent/);
  assert.match(page, /industry: "accounting_firm"/);
  assert.match(page, /disabled=\{signupIntent === "accounting_firm"\}/);
  assert.match(page, /item\.value !== "accounting_firm"/);
});


test("self-signup intent is enforced again at the provisioning API boundary", () => {
  const route = fs.readFileSync("app/api/onboarding/provision/route.js", "utf8");
  assert.match(route, /avantiqo_self_signup/);
  assert.match(route, /requestedSignupIntent !== metadataSignupIntent/);
  assert.match(route, /metadataSignupIntent === "accounting_firm" && industry !== "accounting_firm"/);
  assert.match(route, /metadataSignupIntent === "business" && industry === "accounting_firm"/);
  assert.match(page, /signupIntent,/);
});


test("organization creation requires owner-level staff authority", () => {
  assert.match(provision, /ORGANIZATION_CREATOR_ROLES/);
  assert.match(provision, /Organization creation requires owner authority/);
  const industriesRoute = fs.readFileSync("app/api/onboarding/industries/route.js", "utf8");
  assert.match(industriesRoute, /allowedRoles/);
  assert.match(industriesRoute, /status:403/);
});

test("public Start page keeps returning business access separate from staff supplier and developer entry", () => {
  const start = fs.readFileSync("app/start/page.jsx", "utf8");
  assert.match(start, /Returning business owner \/ admin/);
  assert.match(start, /Staff, suppliers and external developers should use their dedicated entry paths above/);
  assert.match(start, /href:"\/login\?portal=staff"/);
  assert.match(start, /href:"\/supplier-portal"/);
  assert.match(start, /href:"\/signup\?intent=accounting_firm"/);
});
