import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function source(path) { return fs.readFileSync(path, "utf8"); }

test("static host resolver contains only the generic Avantiqo fallback", () => {
  const resolver = source("lib/platform/context/resolvePlatformHostContext.js");
  assert.match(resolver, /DEFAULT_HOST_CONTEXT/);
  assert.match(resolver, /browserBootstrappedContext/);
  assert.doesNotMatch(resolver, /CHURCHILL_CONTEXT|COLE_LEY_CONTEXT|HOST_CONTEXTS|LOGIN_BRAND_CONTEXTS/);
  assert.doesNotMatch(resolver, /33336a72-acb5-474e-856b-8be0269360e2|9550b843-b83c-4d15-b02d-a0b5ca23346e/);
  assert.doesNotMatch(resolver, /churchillkaron\.com|coleley\.com/);
});

test("registered host resolver is organization-scoped and metadata-driven", () => {
  const resolver = source("lib/platform/context/resolveRegisteredPlatformHostContext.js");
  assert.match(resolver, /organization_channel_assets/);
  assert.match(resolver, /channel_provider/);
  assert.match(resolver, /platform_hostname/);
  assert.match(resolver, /metadata\.logo_layout/);
  assert.match(resolver, /metadata\.brand_id/);
});

test("login branding consumes bootstrapped host context without customer brand ids", () => {
  const login = source("app/login/page.js");
  assert.match(login, /resolvePlatformHostContext/);
  assert.match(login, /brand\.logoLayout === "wide"/);
  assert.match(login, /resolvedBrand\.organizationId/);
  assert.doesNotMatch(login, /churchill|coleley|33336a72|9550b843/i);
  assert.doesNotMatch(login, /searchParams\.set\("brand"/);
});

test("login callback and password activation preserve exact registered organization scope", () => {
  const callback = source("app/login/callback/page.js");
  const activation = source("app/api/auth/activate/route.js");
  assert.match(callback, /resolvePlatformHostContext/);
  assert.match(callback, /storedOrganizationId/);
  assert.match(callback, /organizationId=\$\{encodeURIComponent\(requestedOrganizationId\)\}/);
  assert.match(activation, /resolveRegisteredPlatformHostContext/);
  assert.match(activation, /await resolveRecoveryOrganizationId/);
  assert.doesNotMatch(activation, /\bresolvePlatformHostContext\s*\(/);
});

test("known customer hostnames are seeded through canonical hostname migrations", () => {
  const seed = source("supabase/migrations/20260924145500_seed_existing_platform_hostnames.sql");
  const enrich = source("supabase/migrations/20260924151000_enrich_platform_hostname_branding.sql");
  const layout = source("supabase/migrations/20260924152500_platform_hostname_logo_layout.sql");
  for (const hostname of ["app.churchillkaron.com", "coleley.com"]) {
    assert.match(seed, new RegExp(hostname.replaceAll(".", "\\.")));
    assert.match(enrich, new RegExp(hostname.replaceAll(".", "\\.")));
  }
  assert.match(seed, /on conflict \(channel_provider, external_id\)/);
  assert.match(enrich, /brand_id/);
  assert.match(enrich, /logo_src/);
  assert.match(layout, /logo_layout/);
});

test("customer hostname registration is owner-admin governed and DNS verified before trust", () => {
  const route = source("app/api/administration/domains/route.js");
  const registered = source("lib/platform/context/resolveRegisteredPlatformHostContext.js");
  const staff = source("lib/people/workforce/StaffPasskeyBrokerRuntime.js");

  assert.match(route, /MANAGE_ROLES/);
  assert.match(route, /OWNER/);
  assert.match(route, /SUPER_ADMIN/);
  assert.match(route, /PENDING_VERIFICATION/);
  assert.match(route, /resolveTxt/);
  assert.match(route, /verification_token_hash/);
  assert.match(route, /avantiqo-verification=/);
  assert.match(route, /status:"VERIFIED"/);
  assert.match(route, /status:"REVOKED"/);
  assert.match(route, /This hostname is already registered to another organization/);
  assert.doesNotMatch(route, /metadata:\s*\{[^}]*verification_token:/s);

  assert.match(registered, /trustedHostnameAsset/);
  assert.match(registered, /\["ACTIVE", "READY", "VERIFIED", "LIVE"\]/);
  assert.match(staff, /\["ACTIVE", "READY", "VERIFIED", "LIVE"\]/);
});

test("Domains and external access is a progressive onboarding area", () => {
  const center = source("components/workspace/administration/OrganizationSetupWorkCenter.jsx");
  const readiness = source("app/api/onboarding/readiness/route.js");
  const progress = source("app/api/onboarding/progress/route.js");
  const returnBar = source("components/workspace/administration/OnboardingSetupReturnBar.jsx");
  const page = source("app/(system)/workspace/[organizationId]/administration/domains/page.jsx");

  assert.match(center, /\["domains", "Domains & external access", "\/administration\/domains"/);
  assert.match(readiness, /trustedPlatformHostnames/);
  assert.match(readiness, /pendingPlatformHostnames/);
  assert.match(progress, /"domains"/);
  assert.match(returnBar, /\["\/administration\/domains", "domains"\]/);
  assert.match(page, /DNS ownership verification/);
  assert.match(page, /#F7F6F3/);
  assert.match(page, /bg-white/);
});

test("verified hostname branding stays synchronized with canonical Brand setup", () => {
  const runtime = source("lib/platform/context/OrganizationHostnameBrandRuntime.js");
  const upload = source("app/api/creative/brand/onboarding-upload/route.js");
  assert.match(runtime, /resolveBrand/);
  assert.match(runtime, /organization_channel_assets/);
  assert.match(runtime, /existingMetadata/);
  assert.match(runtime, /logo_src/);
  assert.match(runtime, /logo_layout/);
  assert.match(upload, /syncOrganizationHostnameBranding/);
  assert.match(upload, /hostname_brand_sync/);
});

test("Domains remains discoverable from canonical Administration after onboarding", () => {
  const registry = source("lib/platform/administration/registry/administrationWorkspaceRegistry.js");
  const commandCenter = source("components/workspace/administration/AdministrationCommandCenter.jsx");
  assert.match(registry, /DomainsWorkspace/);
  assert.match(registry, /route: "\/administration\/domains"/);
  assert.match(registry, /DomainsWorkspace, PasskeyReadinessWorkspace/);
  assert.match(commandCenter, /Domains & external access/);
  assert.match(commandCenter, /route: "\/administration\/domains"/);
  assert.doesNotMatch(commandCenter, /bg-\[#1F1E1B\]|hover:bg-black/);
});

test("hostname branding stores durable logo references and signs private media only at resolution time", () => {
  const branding = source("lib/platform/context/OrganizationHostnameBrandRuntime.js");
  const resolver = source("lib/platform/context/resolveRegisteredPlatformHostContext.js");

  assert.match(branding, /logo_storage_bucket/);
  assert.match(branding, /logo_storage_path/);
  assert.match(branding, /logo_direct_url/);
  assert.match(branding, /logo_asset_id/);
  assert.match(branding, /\/storage\\\/v1\\\/object\\\/sign\\\//);
  assert.match(branding, /delete next\.logo_src/);

  assert.match(resolver, /metadata\.logo_storage_path/);
  assert.match(resolver, /createSignedUrl\(storagePath, 60 \* 60\)/);
  assert.match(resolver, /metadata\.logo_direct_url/);
});

test("hostname brand synchronization preserves verification metadata while refreshing brand references", () => {
  const branding = source("lib/platform/context/OrganizationHostnameBrandRuntime.js");
  assert.match(branding, /const existing = object\(existingMetadata\)/);
  assert.match(branding, /\.\.\.existing/);
  assert.match(branding, /existingMetadata:row\.metadata/);
  assert.doesNotMatch(branding, /verification_token_hash\s*:/);
});
