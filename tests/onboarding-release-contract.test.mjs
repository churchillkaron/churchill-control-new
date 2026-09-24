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
  assert.match(start, /Staff, suppliers, customers and external developers should use their dedicated entry paths above/);
  assert.match(start, /href:"\/login\?portal=staff"/);
  assert.match(start, /href:"\/supplier-portal"/);
  assert.match(start, /href:"\/signup\?intent=accounting_firm"/);
});

test("self-service owner bootstrap rejects ambiguous or non-owner existing Staff identities", () => {
  const owner = fs.readFileSync("app/api/onboarding/self-service-owner/route.js", "utf8");
  assert.match(owner, /Multiple active Staff identities are linked to this authenticated account/);
  assert.match(owner, /Business organization onboarding requires owner-level Staff authority/);
  assert.match(owner, /OWNER_ROLES/);
  assert.match(owner, /existing\?\.length === 1/);
});

test("self-service owner bootstrap recovers a concurrent unique-email insert without duplicating identity", () => {
  const owner = fs.readFileSync("app/api/onboarding/self-service-owner/route.js", "utf8");
  assert.match(owner, /error\?\.code === "23505"/);
  assert.match(owner, /\.ilike\("email", normalizedEmail\)/);
  assert.match(owner, /String\(raced\[0\]\.auth_user_id \|\| ""\) !== String\(user\.id\)/);
  assert.match(owner, /The signup email is already linked to a different or ambiguous Staff identity/);
  assert.match(owner, /created:false/);
});

test("business onboarding rejects malformed legal and finance context before provisioning", () => {
  assert.match(provisionRoute, /Country must be a recognized country name or two-letter ISO code/);
  assert.match(provisionRoute, /Base currency must be a valid three-letter ISO currency code/);
  assert.match(provisionRoute, /Unsupported accounting standard/);
  assert.match(provisionRoute, /Owner email is invalid/);
  assert.match(provisionRoute, /Intl\.supportedValuesOf\("currency"\)/);
  assert.match(provisionRoute, /ACCOUNTING_STANDARDS/);
});

test("business owner email is bound to the authenticated Avantiqo account at the API boundary", () => {
  assert.match(provisionRoute, /authenticatedEmail/);
  assert.match(provisionRoute, /ownerEmail !== authenticatedEmail/);
  assert.match(provisionRoute, /Owner email must match the authenticated Avantiqo account/);
  assert.match(provisionRoute, /status:403/);
});

test("organization onboarding carries a stable exact-request UUID across retries of unchanged form data", () => {
  assert.match(page, /onboardingRequestRef = useRef\(null\)/);
  assert.match(page, /requestFingerprint = JSON\.stringify/);
  assert.match(page, /globalThis\.crypto\.randomUUID\(\)/);
  assert.match(page, /onboardingRequestId: onboardingRequestRef\.current\.id/);
});

test("onboarding provision requests are server-only and bound to authenticated user plus request UUID", () => {
  const runtime = fs.readFileSync("lib/onboarding/OnboardingProvisionRequestRuntime.js", "utf8");
  const migration = fs.readFileSync("supabase/migrations/20260922234636_onboarding_provision_idempotency.sql", "utf8");
  assert.match(migration, /unique \(auth_user_id, request_id\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.onboarding_provision_requests from public, anon, authenticated/);
  assert.match(runtime, /payload_hash/);
  assert.match(runtime, /Onboarding request ID was already used with different setup data/);
});

test("onboarding preallocates one organization id per exact request and can replay or resume it", () => {
  const runtime = fs.readFileSync("lib/onboarding/OnboardingProvisionRequestRuntime.js", "utf8");
  const createOrganization = fs.readFileSync("lib/organizations/createOrganization.js", "utf8");
  assert.match(runtime, /organizationId = randomUUID\(\)/);
  assert.match(provisionRoute, /payload\.requestedOrganizationId = onboardingReservation\.organization_id/);
  assert.match(provision, /id: payload\?\.requestedOrganizationId \|\| null/);
  assert.match(createOrganization, /\.\.\.\(id \? \{ id \} : \{\}\)/);
  assert.match(provisionRoute, /requestState\.mode === "REPLAY"/);
  assert.match(provisionRoute, /requestState\.mode === "RESUME_PROVISIONED"/);
});

test("onboarding checkpoints provision before supplier linkage and stores durable success for exact replay", () => {
  assert.match(provisionRoute, /markOnboardingProvisioned/);
  assert.match(provisionRoute, /completeOnboardingProvisionRequest/);
  assert.match(provisionRoute, /failOnboardingProvisionRequest/);
  const markIndex = provisionRoute.indexOf("markOnboardingProvisioned({");
  const supplierIndex = provisionRoute.indexOf("business_organization_id: result.organization.id");
  const completeIndex = provisionRoute.indexOf("completeOnboardingProvisionRequest({");
  assert.ok(markIndex >= 0 && supplierIndex > markIndex && completeIndex > supplierIndex);
});

test("onboarding durable replay stores only minimal safe continuation data", () => {
  assert.match(provisionRoute, /const durableReplayPayload = \{/);
  assert.match(provisionRoute, /organization: \{ id: result\.organization\.id \}/);
  assert.match(provisionRoute, /paymentSetupContinuationRequired/);
  assert.match(provisionRoute, /replayed: true/);
  const durableBlock = provisionRoute.slice(
    provisionRoute.indexOf("const durableReplayPayload = {"),
    provisionRoute.indexOf("completeOnboardingProvisionRequest({")
  );
  assert.doesNotMatch(durableBlock, /owner:/);
  assert.doesNotMatch(durableBlock, /finance:/);
  assert.doesNotMatch(durableBlock, /billing:/);
  assert.doesNotMatch(durableBlock, /redirect: responsePayload\.redirect/);
  assert.doesNotMatch(durableBlock, /promptpay_identifier/);
  assert.doesNotMatch(durableBlock, /accountNumber/);
});

test("only a server-confirmed failed onboarding attempt gets a fresh request UUID", () => {
  const runtime = fs.readFileSync("lib/onboarding/OnboardingProvisionRequestRuntime.js", "utf8");
  assert.match(runtime, /retryWithNewOnboardingRequest = true/);
  assert.match(provisionRoute, /retryWithNewOnboardingRequest/);
  assert.match(page, /if \(data\?\.retryWithNewOnboardingRequest === true\)/);
  assert.match(page, /onboardingRequestRef\.current = null/);
  const catchBlock = page.slice(page.indexOf("} catch (submitError)"), page.indexOf("} finally", page.indexOf("} catch (submitError)")));
  assert.doesNotMatch(catchBlock, /onboardingRequestRef\.current = null/);
});

test("onboarding request ledger has defense-in-depth grants and state integrity constraints", () => {
  const migration = fs.readFileSync("supabase/migrations/20260922234636_onboarding_provision_idempotency.sql", "utf8");
  assert.match(migration, /char_length\(payload_hash\) = 64/);
  assert.match(migration, /state <> 'SUCCEEDED'.*response_payload is not null.*completed_at is not null/s);
  assert.match(migration, /state <> 'FAILED' or failed_at is not null/);
  assert.match(migration, /from public, anon, authenticated/);
});

test("stale interrupted onboarding retires request and provisioning shell atomically", () => {
  const runtime = fs.readFileSync("lib/onboarding/OnboardingProvisionRequestRuntime.js", "utf8");
  const migration = fs.readFileSync("supabase/migrations/20260922234636_onboarding_provision_idempotency.sql", "utf8");
  assert.match(runtime, /retire_stale_onboarding_provision_request/);
  assert.match(runtime, /RETIRED_FAILED/);
  assert.match(runtime, /retryWithNewOnboardingRequest = true/);
  assert.match(migration, /from public\.onboarding_provision_requests[\s\S]*for update/);
  assert.match(migration, /from public\.organizations[\s\S]*for update/);
  assert.match(migration, /organization_status = 'SETUP_FAILED'/);
  assert.match(migration, /state = 'FAILED'/);
  assert.match(migration, /ONBOARDING_STALE_ORGANIZATION_RETIRE_CONFLICT/);
  assert.match(migration, /ONBOARDING_STALE_REQUEST_RETIRE_CONFLICT/);
});

test("stale onboarding recovery preserves an organization that became active during retirement", () => {
  const runtime = fs.readFileSync("lib/onboarding/OnboardingProvisionRequestRuntime.js", "utf8");
  const migration = fs.readFileSync("supabase/migrations/20260922234636_onboarding_provision_idempotency.sql", "utf8");
  assert.match(migration, /v_org\.organization_status = 'ACTIVE'/);
  assert.match(migration, /state = 'PROVISIONED'/);
  assert.match(migration, /failed_at = null/);
  assert.match(migration, /RESUME_PROVISIONED/);
  assert.match(runtime, /outcome\?\.outcome === "RESUME_PROVISIONED"/);
  assert.match(runtime, /mode: "RESUME_PROVISIONED"/);
});

test("public onboarding entry pages do not wait on Supabase session refresh", () => {
  const middleware = fs.readFileSync("middleware.js", "utf8");
  assert.match(middleware, /function isPublicEntryPath\(pathname\)/);
  assert.match(middleware, /pathname === "\/start"/);
  assert.match(middleware, /pathname === "\/signup"/);
  assert.match(middleware, /pathname === "\/login"/);
  assert.match(middleware, /const sessionResponse = publicEntryRequest \|\| localWorkspaceRequest/);
  assert.match(middleware, /await refreshSupabaseSession\(request\)/);
});

test("local loopback hosts resolve Avantiqo context without Supabase lookup", () => {
  const resolver = fs.readFileSync("lib/platform/context/resolveRegisteredPlatformHostContext.js", "utf8");
  assert.match(resolver, /normalizedHostname === "localhost"/);
  assert.match(resolver, /normalizedHostname === "127\.0\.0\.1"/);
  assert.match(resolver, /normalizedHostname === "::1"/);
  const localIndex = resolver.indexOf('normalizedHostname === "127.0.0.1"');
  const adminIndex = resolver.indexOf("const supabaseAdmin = await getSupabaseAdmin()");
  assert.ok(localIndex >= 0 && adminIndex > localIndex);
});

test("platform hostname normalization preserves IPv4 and IPv6 loopback identities", () => {
  const resolver = fs.readFileSync("lib/platform/context/resolvePlatformHostContext.js", "utf8");
  assert.match(resolver, /first\.startsWith\("\["\)/);
  assert.match(resolver, /first === "::1"/);
  assert.match(resolver, /new URL\(raw\)\.hostname\.replace\(\/\^\\\[\|\\\]\$\/g, ""\)/);
});

test("onboarding reports missing PostgREST schema as a migration prerequisite", () => {
  const runtime = fs.readFileSync("lib/onboarding/OnboardingProvisionRequestRuntime.js", "utf8");
  const route = fs.readFileSync("app/api/onboarding/provision/route.js", "utf8");
  assert.match(runtime, /code === "PGRST205"/);
  assert.match(runtime, /retire_stale_onboarding_provision_request/);
  assert.match(runtime, /ONBOARDING_MIGRATION_REQUIRED/);
  assert.match(runtime, /error\.status = 503/);
  assert.match(route, /code: error\?\.code \|\| undefined/);
});

test("business onboarding migration prerequisite uses a customer-safe message and operations code", () => {
  const runtime = fs.readFileSync("lib/onboarding/OnboardingProvisionRequestRuntime.js", "utf8");
  assert.match(runtime, /Business setup is temporarily unavailable/);
  assert.match(runtime, /ONBOARDING_MIGRATION_REQUIRED/);
  assert.doesNotMatch(runtime, /new Error\("Onboarding idempotency migration is not installed"\)/);
});

test("cookie-based server auth skips Supabase when no session cookie exists", () => {
  const auth = fs.readFileSync("lib/auth/getServerCurrentUser.js", "utf8");
  assert.match(auth, /cookieStore\.getAll\(\)\.some/);
  assert.match(auth, /name\.startsWith\("sb-"\) && name\.includes\("-auth-token"\)/);
  const cookieCheck = auth.indexOf("hasSupabaseSessionCookie");
  const authLookup = auth.indexOf("supabase.auth.getUser()");
  assert.ok(cookieCheck >= 0 && authLookup > cookieCheck);
  assert.match(auth, /if \(!hasSupabaseSessionCookie\) \{[\s\S]*return null;/);
});
