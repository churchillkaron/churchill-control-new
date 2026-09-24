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

test("Thailand onboarding derives governed Finance defaults and requires binary VAT registration", () => {
  const jurisdiction = fs.readFileSync("lib/onboarding/OnboardingJurisdictionPolicy.js", "utf8");
  assert.match(jurisdiction, /currency: "THB"/);
  assert.match(jurisdiction, /accounting_standard: "TFRS"/);
  assert.match(jurisdiction, /timezone: "Asia\/Bangkok"/);
  assert.match(jurisdiction, /locale: "th-TH"/);
  assert.match(jurisdiction, /vat_rate: 0\.07/);
  assert.match(jurisdiction, /vat_rate_valid_through: "2027-09-30"/);
  assert.match(page, /VAT registered\?/);
  assert.match(page, /\[true, false\]\.map/);
  assert.doesNotMatch(page, /Not sure/);
  assert.match(provisionRoute, /VAT registration must be answered Yes or No/);
});

test("VAT registration Yes requires tax registration while No does not activate VAT by country alone", () => {
  assert.match(page, /form\.vatRegistered === true/);
  assert.match(page, /VAT \/ tax registration number/);
  assert.match(provisionRoute, /vatRegistered && !taxRegistrationNumber/);
  const applyTax = fs.readFileSync("lib/finance/tax/workflows/applyTaxSetup.js", "utf8");
  assert.match(applyTax, /vat_registered: Boolean\(vatRegistered\)/);
  assert.doesNotMatch(applyTax, /vat_registered:\s*taxRegime === "THAILAND"/);
});

test("initial organization creation does not collect customer payment credentials", () => {
  assert.doesNotMatch(page, /Will this organization accept payments from customers\?/);
  assert.doesNotMatch(page, /PromptPay identifier/);
  assert.doesNotMatch(page, /Account number/);
  assert.match(page, /paymentSetup: \{ enabled: false \}/);
});

test("owner identity is prefilled from the authenticated server user", () => {
  assert.match(page, /fetch\("\/api\/auth\/server-user"/);
  assert.match(page, /user\.user_metadata\?\.full_name/);
  assert.match(page, /ownerEmail: previous\.ownerEmail \|\| user\.email/);
});

test("brand onboarding requires distinct primary logo and compact icon concepts", () => {
  const brandPage = fs.readFileSync("app/(system)/workspace/[organizationId]/commercial/marketing/brand/page.jsx", "utf8");
  const resolver = fs.readFileSync("lib/platform/documents/branding/BrandResolver.js", "utf8");
  const bootstrap = fs.readFileSync("lib/creative/brand/runtime/CreativeBrandBootstrapRuntime.js", "utf8");
  assert.match(brandPage, /Primary Logo/);
  assert.match(brandPage, /Logo Icon \/ Compact Mark/);
  assert.match(resolver, /logo_icon_asset_id/);
  assert.match(resolver, /logo_icon_url/);
  assert.match(bootstrap, /logo_icon_asset_id/);
  assert.match(bootstrap, /LOGO_DERIVED_RECOMMENDATION/);
});

test("post-creation setup is progressive and backed by live organization readiness", () => {
  const readiness = fs.readFileSync("app/api/onboarding/readiness/route.js", "utf8");
  const setup = fs.readFileSync("components/workspace/administration/OrganizationSetupWorkCenter.jsx", "utf8");
  const setupPage = fs.readFileSync("app/(system)/workspace/[organizationId]/administration/onboarding/page.jsx", "utf8");
  assert.match(provisionRoute, /administration\/onboarding/);
  assert.match(setupPage, /OrganizationSetupWorkCenter/);
  assert.match(setup, /commercial\/marketing\/brand/);
  assert.match(readiness, /organization_modules/);
  assert.match(readiness, /organization_channel_connections/);
  assert.match(readiness, /organization_payment_config/);
  assert.match(readiness, /organization_accounting_profiles/);
  assert.match(setup, /Configured/);
  assert.match(setup, /Review/);
  assert.match(setup, /Optional/);
});

test("onboarding tax setup writes organization-scoped VAT and never creates one universal Thailand WHT rate", () => {
  const applyTax = fs.readFileSync("lib/finance/tax/workflows/applyTaxSetup.js", "utf8");
  assert.match(applyTax, /organization_id: organizationId/);
  assert.match(applyTax, /effective_to: vatRateValidThrough/);
  assert.match(applyTax, /\.eq\("organization_id", organizationId\)/);
  assert.match(applyTax, /Thailand withholding tax rates depend on payment\/income type/);
  assert.doesNotMatch(applyTax, /tax_rate: 0\.03/);
});

test("VAT calculation is organization-scoped and refuses VAT for non-registered organizations", () => {
  const calculateTax = fs.readFileSync("lib/finance/tax/capabilities/calculateTax.js", "utf8");
  assert.match(calculateTax, /VAT_NOT_REGISTERED/);
  assert.match(calculateTax, /organization_id\.eq\.\$\{organizationId\},organization_id\.is\.null/);
  assert.match(calculateTax, /organizationRule \|\| globalRule/);
  assert.match(calculateTax, /effective_from/);
  assert.match(calculateTax, /effective_to/);
});

test("communication onboarding keeps provider authorization inside the same organization setup flow", () => {
  const setup = fs.readFileSync("app/(system)/workspace/[organizationId]/administration/communications-setup/page.jsx", "utf8");
  const googleAuth = fs.readFileSync("app/api/email/google/auth/route.js", "utf8");
  const googleCallback = fs.readFileSync("app/api/email/google/auth/callback/route.js", "utf8");
  const microsoftAuth = fs.readFileSync("app/api/email/microsoft/auth/route.js", "utf8");
  const microsoftCallback = fs.readFileSync("app/api/email/microsoft/auth/callback/route.js", "utf8");
  const metaAuth = fs.readFileSync("app/api/meta/auth/route.js", "utf8");
  const metaCallback = fs.readFileSync("app/api/meta/auth/callback/route.js", "utf8");
  assert.match(setup, /onboarding=1/);
  assert.match(googleAuth, /return_path/);
  assert.match(microsoftAuth, /return_path/);
  assert.match(googleCallback, /safeReturnPath/);
  assert.match(microsoftCallback, /safeReturnPath/);
  assert.match(googleCallback, /communications-setup\?onboarding=1/);
  assert.match(microsoftCallback, /communications-setup\?onboarding=1/);
  assert.match(metaAuth, /meta_oauth_return_path/);
  assert.match(metaCallback, /safeReturnPath/);
  assert.match(metaCallback, /communications-setup\?onboarding=1/);
});

test("customer payment onboarding uses the governed payment runtime instead of POS checkout", () => {
  const setup = fs.readFileSync("components/workspace/administration/OrganizationSetupWorkCenter.jsx", "utf8");
  const paymentRoute = fs.readFileSync("app/api/onboarding/payments/route.js", "utf8");
  const paymentPage = fs.readFileSync("app/(system)/workspace/[organizationId]/administration/payments/page.jsx", "utf8");
  assert.match(setup, /\/administration\/payments/);
  assert.doesNotMatch(setup, /\/operations\/pos\/payments/);
  assert.match(paymentRoute, /OrganizationPaymentOnboardingRuntime\.configure/);
  assert.match(paymentRoute, /PromptPay is only available for Thailand entities/);
  assert.match(paymentPage, /Avantiqo does not become the merchant/);
  assert.match(paymentPage, /Settlement bank account/);
});

test("organization setup readiness is module-aware and can surface review states", () => {
  const readiness = fs.readFileSync("app/api/onboarding/readiness/route.js", "utf8");
  const setup = fs.readFileSync("components/workspace/administration/OrganizationSetupWorkCenter.jsx", "utf8");
  assert.match(readiness, /moduleEnabled\("finance", "accounting"\)/);
  assert.match(readiness, /moduleEnabled\("hr", "payroll"\)/);
  assert.match(readiness, /moduleEnabled\("inventory", "procurement", "kitchen"\)/);
  assert.match(readiness, /needsReview/);
  assert.match(setup, /Review/);
  assert.match(setup, /readiness\?\.sections\?\.\[key\]\?\.enabled !== false/);
});

test("hidden VAT registration data is cleared when VAT becomes No or Thailand is left", () => {
  assert.match(page, /function updateVatRegistration/);
  assert.match(page, /taxRegistrationNumber: value === true \? previous\.taxRegistrationNumber : ""/);
  assert.match(page, /taxRegistrationNumber: thai \? previous\.taxRegistrationNumber : ""/);
});

test("channels and connections onboarding exposes every canonical customer connection family", () => {
  const setup = fs.readFileSync("app/(system)/workspace/[organizationId]/administration/communications-setup/page.jsx", "utf8");
  for (const provider of [
    "meta", "whatsapp", "line", "telegram", "sms", "email", "threads", "tiktok", "youtube", "pinterest", "linkedin", "x",
    "google-business", "google-ads", "shopify", "tripadvisor",
  ]) {
    assert.match(setup, new RegExp(`\\"${provider}\\"`));
  }
  assert.match(setup, /Messaging & inbox/);
  assert.match(setup, /Social publishing/);
  assert.match(setup, /Business presence & reviews/);
  assert.match(setup, /Advertising/);
  assert.match(setup, /Commerce/);
});

test("social onboarding OAuth preserves only the same-organization setup return path", () => {
  const auth = fs.readFileSync("app/api/social/[provider]/auth/route.js", "utf8");
  const callback = fs.readFileSync("app/api/social/[provider]/auth/callback/route.js", "utf8");
  assert.match(auth, /return_path/);
  assert.match(auth, /communications-setup\?onboarding=1/);
  assert.match(callback, /safeReturnPath/);
  assert.match(callback, /candidate === allowed/);
  assert.match(callback, /communications-setup\?onboarding=1/);
});

test("Google Business and Google Ads onboarding preserve the exact setup return path", () => {
  const businessAuth = fs.readFileSync("app/api/google/auth/route.js", "utf8");
  const adsAuth = fs.readFileSync("app/api/google-ads/auth/route.js", "utf8");
  const callback = fs.readFileSync("app/api/google/auth/callback/route.js", "utf8");
  assert.match(businessAuth, /onboardingReturnPath/);
  assert.match(adsAuth, /onboardingReturnPath/);
  assert.match(businessAuth, /return_path/);
  assert.match(adsAuth, /return_path/);
  assert.match(callback, /safeReturnPath/);
  assert.match(callback, /authorization/);
  assert.match(callback, /communications-setup\?onboarding=1/);
});

test("Shopify and Tripadvisor stay inside onboarding while customer setup is incomplete", () => {
  const shopifyAuth = fs.readFileSync("app/api/shopify/auth/route.js", "utf8");
  const shopifyCallback = fs.readFileSync("app/api/shopify/auth/callback/route.js", "utf8");
  const tripadvisorAuth = fs.readFileSync("app/api/tripadvisor/auth/route.js", "utf8");
  const shopifyPage = fs.readFileSync("app/(system)/workspace/[organizationId]/administration/integrations/shopify-connect/page.jsx", "utf8");
  const tripadvisorPage = fs.readFileSync("app/(system)/workspace/[organizationId]/administration/integrations/tripadvisor-connect/page.jsx", "utf8");
  assert.match(shopifyAuth, /return_path/);
  assert.match(shopifyCallback, /safeReturnPath/);
  assert.match(shopifyPage, /onboarding/);
  assert.match(shopifyPage, /!onboarding \? <ShopifyInventorySyncPanel/);
  assert.match(tripadvisorAuth, /\?onboarding=1/);
  assert.match(tripadvisorPage, /onboarding/);
});

test("provider detail pages use light Avantiqo onboarding modes without replacing normal integration tools", () => {
  const email = fs.readFileSync("components/administration/integrations/EmailIntegrationCard.jsx", "utf8");
  const whatsapp = fs.readFileSync("components/administration/integrations/WhatsAppIntegrationCard.jsx", "utf8");
  const line = fs.readFileSync("components/administration/integrations/LINEIntegrationCard.jsx", "utf8");
  const shopify = fs.readFileSync("components/administration/integrations/ShopifyIntegrationCard.jsx", "utf8");
  const tripadvisor = fs.readFileSync("components/administration/integrations/TripadvisorIntegrationCard.jsx", "utf8");
  for (const source of [email, whatsapp, line, shopify, tripadvisor]) {
    assert.match(source, /onboarding/);
    assert.match(source, /#F7F6F3/);
    assert.match(source, /bg-white/);
    assert.doesNotMatch(source, /bg-black/);
    assert.doesNotMatch(source, /(?:violet|indigo|cyan|sky-|teal-|blue-)/);
  }
});

test("Meta onboarding uses a server-side asset picker when multiple business Pages are authorized", () => {
  const callback = fs.readFileSync("app/api/meta/auth/callback/route.js", "utf8");
  const selection = fs.readFileSync("app/api/administration/integrations/meta/selection/route.js", "utf8");
  const runtime = fs.readFileSync("lib/platform/channels/meta/MetaOrganizationConnectionRuntime.js", "utf8");
  const page = fs.readFileSync("app/(system)/workspace/[organizationId]/administration/meta-setup/page.jsx", "utf8");
  assert.match(callback, /pages\.length > 1 && !preferredPageId/);
  assert.match(callback, /oauth_user_token_pending_selection/);
  assert.match(callback, /maxAge:600/);
  assert.match(callback, /meta_pending_credential_id/);
  assert.match(selection, /CredentialRuntime\.resolve/);
  assert.match(selection, /META_PENDING_PAGE_SELECTION/);
  assert.match(selection, /status:"INACTIVE"/);
  assert.match(runtime, /finalizeMetaOrganizationConnection/);
  assert.match(page, /Choose the business Page/);
  assert.match(page, /Use this Page/);
});

test("Google Business onboarding can explicitly exclude provider locations from this organization", () => {
  const route = fs.readFileSync("app/api/administration/integrations/google-business/route.js", "utf8");
  const catalog = fs.readFileSync("app/api/administration/integrations/catalog/route.js", "utf8");
  const page = fs.readFileSync("app/(system)/workspace/[organizationId]/administration/google-business-setup/page.jsx", "utf8");
  assert.match(route, /ignore-location/);
  assert.match(route, /assignment_status: "IGNORED"/);
  assert.match(route, /assignment_status: "ASSIGNED"/);
  assert.match(catalog, /assignment_status/);
  assert.match(catalog, /Review locations/);
  assert.match(page, /Not this organization/);
  assert.match(page, /Needs decision/);
});

test("Google asset review has dedicated light onboarding surfaces", () => {
  const hub = fs.readFileSync("app/(system)/workspace/[organizationId]/administration/communications-setup/page.jsx", "utf8");
  const business = fs.readFileSync("app/(system)/workspace/[organizationId]/administration/google-business-setup/page.jsx", "utf8");
  const ads = fs.readFileSync("app/(system)/workspace/[organizationId]/administration/google-ads-setup/page.jsx", "utf8");
  const adsCard = fs.readFileSync("components/administration/integrations/GoogleAdsIntegrationCard.jsx", "utf8");
  assert.match(hub, /google-business-setup\?onboarding=1/);
  assert.match(hub, /google-ads-setup\?onboarding=1/);
  assert.match(business, /#F7F6F3/);
  assert.match(ads, /#F7F6F3/);
  assert.match(adsCard, /onboarding/);
  assert.match(adsCard, /Connect existing account/);
});

test("explicit provider review/demo assets are excluded from customer readiness", () => {
  const catalog = fs.readFileSync("app/api/administration/integrations/catalog/route.js", "utf8");
  assert.match(catalog, /metadata\.review_demo !== true/);
  assert.match(catalog, /metadata\.temporary !== true/);
});

test("Telegram is a first-class organization channel with secure setup and Unified Inbox delivery", () => {
  const businessConnections = fs.readFileSync("lib/platform/channels/BusinessConnectionRegistry.js", "utf8");
  const providers = fs.readFileSync("lib/platform/service-runtime/providers/ProviderRegistry.js", "utf8");
  const executor = fs.readFileSync("lib/platform/service-runtime/providers/ProviderExecutorCore.js", "utf8");
  const credentials = fs.readFileSync("lib/platform/service-runtime/providers/telegram/TelegramCredentialRegistration.js", "utf8");
  const provider = fs.readFileSync("lib/platform/service-runtime/providers/telegram/TelegramProvider.js", "utf8");
  const setupApi = fs.readFileSync("app/api/administration/integrations/telegram/route.js", "utf8");
  const webhook = fs.readFileSync("app/api/commercial/communications/webhooks/telegram/[connectionId]/route.js", "utf8");
  const channelCatalog = fs.readFileSync("lib/commercial/communications/CommunicationChannelCatalog.js", "utf8");
  const inbox = fs.readFileSync("components/workspace/commercial/CommunicationsWorkspace.jsx", "utf8");
  assert.match(businessConnections, /id: "telegram"/);
  assert.match(businessConnections, /technicalInputRequired/);
  assert.match(providers, /id:"telegram"/);
  assert.match(providers, /communication\.telegram\.send/);
  assert.match(executor, /telegram: \(\) => import\("\.\/telegram\/TelegramProvider\.js"\)/);
  assert.match(credentials, /resolveProviderCredentialSecret/);
  assert.match(credentials, /ORGANIZATION_TELEGRAM_BOT/);
  assert.match(provider, /communication\.telegram\.send/);
  assert.match(setupApi, /CredentialRuntime\.storeSecret/);
  assert.match(setupApi, /configureTelegramWebhook/);
  assert.match(webhook, /x-telegram-bot-api-secret-token/);
  assert.match(webhook, /ingestInboundCommunication/);
  assert.match(channelCatalog, /serviceId: "telegram"/);
  assert.match(channelCatalog, /capability: "communication\.telegram\.send"/);
  assert.match(inbox, /\["telegram", "Telegram"\]/);
});

test("Telegram setup never returns or stores the bot token in organization connection metadata", () => {
  const setupApi = fs.readFileSync("app/api/administration/integrations/telegram/route.js", "utf8");
  const connectionRuntime = fs.readFileSync("lib/platform/channels/telegram/TelegramConnectionRuntime.js", "utf8");
  assert.match(setupApi, /credential_type:"bot_token"/);
  assert.match(setupApi, /vault_name:/);
  assert.doesNotMatch(setupApi, /metadata:\{[^}]*bot_token/s);
  assert.match(connectionRuntime, /secret_token:secretToken/);
  assert.match(connectionRuntime, /sha256/);
});

test("YouTube is a vault-backed first-class customer connection with governed publishing", () => {
  const businessConnections = fs.readFileSync("lib/platform/channels/BusinessConnectionRegistry.js", "utf8");
  const providers = fs.readFileSync("lib/platform/service-runtime/providers/ProviderRegistry.js", "utf8");
  const executor = fs.readFileSync("lib/platform/service-runtime/providers/ProviderExecutorCore.js", "utf8");
  const credentials = fs.readFileSync("lib/platform/service-runtime/providers/youtube/YouTubeCredentialRegistration.js", "utf8");
  const provider = fs.readFileSync("lib/platform/service-runtime/providers/youtube/YouTubeProvider.js", "utf8");
  const auth = fs.readFileSync("app/api/youtube/auth/route.js", "utf8");
  const callback = fs.readFileSync("app/api/youtube/auth/callback/route.js", "utf8");
  const catalog = fs.readFileSync("app/api/administration/integrations/catalog/route.js", "utf8");
  assert.match(businessConnections, /id: "youtube"/);
  assert.match(businessConnections, /\/api\/youtube\/auth/);
  assert.match(providers, /runtime:"youtube"[\s\S]*runtimeAvailable:true/);
  assert.match(executor, /youtube: \(\) => import\("\.\/youtube\/YouTubeProvider\.js"\)/);
  assert.match(credentials, /resolveProviderCredentialSecret/);
  assert.match(credentials, /ORGANIZATION_YOUTUBE_CONNECTION/);
  assert.match(provider, /marketing\.youtube\.publish/);
  assert.match(provider, /uploadType","resumable/);
  assert.match(provider, /privacy_status/);
  assert.match(provider, /CredentialRuntime\.storeSecret/);
  assert.match(auth, /youtube\.upload/);
  assert.match(auth, /access_type","offline/);
  assert.match(callback, /youtube\/v3\/channels/);
  assert.match(callback, /CredentialRuntime\.storeSecret/);
  assert.match(catalog, /Connected — upload restriction/);
});

test("YouTube onboarding return is same-organization scoped and upload audit is explicit", () => {
  const auth = fs.readFileSync("app/api/youtube/auth/route.js", "utf8");
  const callback = fs.readFileSync("app/api/youtube/auth/callback/route.js", "utf8");
  const hub = fs.readFileSync("app/(system)/workspace/[organizationId]/administration/communications-setup/page.jsx", "utf8");
  assert.match(auth, /communications-setup\?onboarding=1/);
  assert.match(callback, /safeReturnPath/);
  assert.match(callback, /candidate===allowed/);
  assert.match(callback, /YOUTUBE_UPLOAD_AUDIT_APPROVED/);
  assert.match(hub, /youtube: "\/brand-icons\/youtube\.svg"/);
});

test("SMS is a first-class Twilio-backed organization channel with signed inbound and delivery webhooks", () => {
  const connections = fs.readFileSync("lib/platform/channels/BusinessConnectionRegistry.js", "utf8");
  const providerRegistry = fs.readFileSync("lib/platform/service-runtime/providers/ProviderRegistry.js", "utf8");
  const provider = fs.readFileSync("lib/platform/service-runtime/providers/sms/SMSProvider.js", "utf8");
  const credentials = fs.readFileSync("lib/platform/service-runtime/providers/sms/SMSCredentialRegistration.js", "utf8");
  const runtime = fs.readFileSync("lib/platform/channels/sms/TwilioSMSRuntime.js", "utf8");
  const setup = fs.readFileSync("app/api/administration/integrations/sms/route.js", "utf8");
  const inbound = fs.readFileSync("app/api/commercial/communications/webhooks/sms/[connectionId]/route.js", "utf8");
  const status = fs.readFileSync("app/api/commercial/communications/webhooks/sms/[connectionId]/status/route.js", "utf8");
  const catalog = fs.readFileSync("lib/commercial/communications/CommunicationChannelCatalog.js", "utf8");
  assert.match(connections, /id: "sms"/);
  assert.match(connections, /SMS — Twilio/);
  assert.match(providerRegistry, /id:"sms"/);
  assert.match(providerRegistry, /communication\.sms\.send/);
  assert.match(provider, /api\.twilio\.com\/2010-04-01/);
  assert.match(provider, /StatusCallback/);
  assert.match(credentials, /resolveProviderCredentialSecret/);
  assert.match(setup, /CredentialRuntime\.storeSecret/);
  assert.match(setup, /configureTwilioInbound/);
  assert.match(inbound, /x-twilio-signature/i);
  assert.match(runtime, /createHmac\("sha1"/);
  assert.match(inbound, /validateTwilioSignature/);
  assert.match(inbound, /ingestInboundCommunication/);
  assert.match(status, /applyCommunicationDeliveryStatus/);
  assert.match(status, /applyStaffPhoneVerificationDeliveryStatus/);
  assert.match(catalog, /serviceId: "sms"/);
});

test("customer-owned Twilio SMS is governed as zero Avantiqo charge with direct provider billing", () => {
  const adapters = fs.readFileSync("lib/platform/service-runtime/billing/adapters/ProviderSupplierBillingAdapters.js", "utf8");
  const funding = fs.readFileSync("lib/platform/service-runtime/execution/ProviderExecutionFundingGuard.js", "utf8");
  const execution = fs.readFileSync("lib/platform/service-runtime/execution/ServiceExecutionRuntime.js", "utf8");
  const migration = fs.readFileSync("supabase/migrations/20260924112000_sms_customer_direct_provider_pricing.sql", "utf8");
  assert.match(adapters, /customer-direct-sms-provider/);
  assert.match(adapters, /billing_owner: "CUSTOMER_ORGANIZATION"/);
  assert.match(adapters, /customer_direct_provider_billing_allowed: true/);
  assert.match(funding, /isCustomerDirectProviderZeroCost/);
  assert.match(funding, /CUSTOMER_DIRECT_PROVIDER_BILLING_ZERO_AVANTIQO_CHARGE/);
  assert.match(execution, /CUSTOMER_DIRECT_PROVIDER_BILLING_ZERO_AVANTIQO_CHARGE/);
  assert.match(migration, /provider_cost_billed_directly_to_customer/);
  assert.match(migration, /avantiqo_customer_price', 0/);
});

test("SMS setup is visible in the channel hub and no longer implementation-required", () => {
  const hub = fs.readFileSync("app/(system)/workspace/[organizationId]/administration/communications-setup/page.jsx", "utf8");
  const marketing = fs.readFileSync("lib/marketing/campaigns/MarketingChannelCatalog.js", "utf8");
  const page = fs.readFileSync("app/(system)/workspace/[organizationId]/administration/sms-setup/page.jsx", "utf8");
  assert.match(hub, /sms: "SMS"/);
  assert.match(marketing, /\["sms","SMS"[\s\S]*"ACTIVE_IF_CONFIGURED"/);
  const smsRow = marketing.split("\n").find((line) => line.includes('["sms","SMS"')) || "";
  assert.match(smsRow, /"ACTIVE_IF_CONFIGURED"/);
  assert.doesNotMatch(smsRow, /"IMPLEMENTATION_REQUIRED"/);
  assert.match(page, /Connect this organization’s Twilio account/);
  assert.match(page, /server-side vault/);
});

test("Email marketing channel reflects the already-governed mailbox runtime", () => {
  const marketing = fs.readFileSync("lib/marketing/campaigns/MarketingChannelCatalog.js", "utf8");
  const registration = fs.readFileSync("lib/platform/service-runtime/providers/email/EmailProviderRegistration.js", "utf8");
  const provider = fs.readFileSync("lib/platform/service-runtime/providers/email/EmailUnifiedProvider.js", "utf8");
  const catalog = fs.readFileSync("lib/commercial/communications/CommunicationChannelCatalog.js", "utf8");
  const row = marketing.split("\n").find((line) => line.includes('["email","Email"')) || "";
  assert.match(row, /"ACTIVE_IF_CONFIGURED"/);
  assert.doesNotMatch(row, /"IMPLEMENTATION_REQUIRED"/);
  assert.match(registration, /communication\.email\.send/);
  assert.match(provider, /communication\.email\.send/);
  assert.match(catalog, /email_google/);
  assert.match(catalog, /email_microsoft/);
  assert.match(catalog, /email_imap/);
});

test("Email Telegram and YouTube zero-price execution satisfy the current supplier-exempt guard", () => {
  const migration = fs.readFileSync("supabase/migrations/20260924113500_connected_channel_zero_price_governance.sql", "utf8");
  const funding = fs.readFileSync("lib/platform/service-runtime/execution/ProviderExecutionFundingGuard.js", "utf8");
  assert.match(migration, /email_google/);
  assert.match(migration, /email_microsoft/);
  assert.match(migration, /email_imap/);
  assert.match(migration, /communication\.telegram\.send/);
  assert.match(migration, /marketing\.youtube\.publish/);
  assert.match(migration, /marketing\.youtube\.analytics/);
  assert.match(migration, /provider_supplier_account_verification_required', false/);
  assert.match(funding, /isExplicitSupplierExemptZeroCost/);
});

test("Pinterest is a vault-backed organic social connection with board discovery and Pin publishing", () => {
  const businessConnections = fs.readFileSync("lib/platform/channels/BusinessConnectionRegistry.js", "utf8");
  const providers = fs.readFileSync("lib/platform/service-runtime/providers/ProviderRegistry.js", "utf8");
  const executor = fs.readFileSync("lib/platform/service-runtime/providers/ProviderExecutorCore.js", "utf8");
  const credentials = fs.readFileSync("lib/platform/service-runtime/providers/pinterest/PinterestCredentialRegistration.js", "utf8");
  const provider = fs.readFileSync("lib/platform/service-runtime/providers/pinterest/PinterestProvider.js", "utf8");
  const auth = fs.readFileSync("app/api/pinterest/auth/route.js", "utf8");
  const callback = fs.readFileSync("app/api/pinterest/auth/callback/route.js", "utf8");
  const catalog = fs.readFileSync("app/api/administration/integrations/catalog/route.js", "utf8");
  assert.match(businessConnections, /id: "pinterest"/);
  assert.match(businessConnections, /\/api\/pinterest\/auth/);
  assert.match(providers, /runtime:"pinterest"[\s\S]*runtimeAvailable:true/);
  assert.doesNotMatch(providers.slice(providers.indexOf('pinterest: {'), providers.indexOf('youtube: {')), /marketing\.pinterest\.ads\.manage/);
  assert.match(executor, /pinterest: \(\) => import\("\.\/pinterest\/PinterestProvider\.js"\)/);
  assert.match(credentials, /resolveProviderCredentialSecret/);
  assert.match(provider, /marketing\.pinterest\.publish/);
  assert.match(provider, /marketing\.pinterest\.boards\.read/);
  assert.match(provider, /source_type:"image_url"/);
  assert.match(auth, /boards:read,pins:read,pins:write/);
  assert.match(callback, /api\.pinterest\.com\/v5\/user_account/);
  assert.match(callback, /api\.pinterest\.com\/v5\/boards/);
  assert.match(callback, /CredentialRuntime\.storeSecret/);
  assert.match(catalog, /Organic Pin publishing/);
  assert.match(catalog, /Pinterest Ads/);
});

test("Pinterest onboarding return and zero-price API execution are governed explicitly", () => {
  const auth = fs.readFileSync("app/api/pinterest/auth/route.js", "utf8");
  const callback = fs.readFileSync("app/api/pinterest/auth/callback/route.js", "utf8");
  const migration = fs.readFileSync("supabase/migrations/20260924115000_pinterest_zero_price_governance.sql", "utf8");
  const hub = fs.readFileSync("app/(system)/workspace/[organizationId]/administration/communications-setup/page.jsx", "utf8");
  assert.match(auth, /communications-setup\?onboarding=1/);
  assert.match(callback, /safeReturnPath/);
  assert.match(callback, /candidate===allowed/);
  assert.match(migration, /marketing\.pinterest\.publish/);
  assert.match(migration, /marketing\.pinterest\.boards\.read/);
  assert.match(migration, /provider_supplier_account_verification_required', false/);
  assert.match(hub, /pinterest: "\/brand-icons\/pinterest\.svg"/);
});

test("organization setup counts canonical business connections instead of a stale provider subset", () => {
  const readiness = fs.readFileSync("app/api/onboarding/readiness/route.js", "utf8");
  assert.match(readiness, /listBusinessConnections/);
  assert.match(readiness, /businessConnectionProviders/);
  assert.match(readiness, /businessConnections\.length/);
  assert.doesNotMatch(readiness, /const communicationProviders = new Set/);
});

test("hotel distribution onboarding is module-aware and proof-based", () => {
  const readiness = fs.readFileSync("app/api/onboarding/readiness/route.js", "utf8");
  const setup = fs.readFileSync("components/workspace/administration/OrganizationSetupWorkCenter.jsx", "utf8");
  const transport = fs.readFileSync("lib/hotel/channels/HotelChannelTransportRegistry.js", "utf8");
  assert.match(readiness, /hotel_channel_connections/);
  assert.match(readiness, /moduleEnabled\("hotel", "reservations", "frontdesk"\)/);
  assert.match(readiness, /provider_certified/);
  assert.match(readiness, /last_success_at/);
  assert.match(setup, /Hotel distribution channels/);
  assert.match(setup, /\/operations\/channel-manager/);
  assert.match(transport, /booking_com:[\s\S]*implemented: true/);
  assert.match(transport, /reservationIngestImplemented: false/);
  assert.match(transport, /agoda:[\s\S]*implemented: false/);
  assert.match(transport, /expedia_group:[\s\S]*implemented: false/);
  assert.match(transport, /airbnb:[\s\S]*implemented: false/);
});

test("approval-bound channels stay visible without fake customer connect actions", () => {
  const registry = fs.readFileSync("lib/platform/channels/BusinessConnectionRegistry.js", "utf8");
  const catalog = fs.readFileSync("app/api/administration/integrations/catalog/route.js", "utf8");
  const hub = fs.readFileSync("app/(system)/workspace/[organizationId]/administration/communications-setup/page.jsx", "utf8");
  for (const id of ["yelp", "opentable", "push"]) {
    const start = registry.indexOf(`id: "${id}"`);
    assert.ok(start >= 0, `${id} must exist in the business connection registry`);
    const end = registry.indexOf("\n  {", start + 10);
    const block = registry.slice(start, end > start ? end : registry.length);
    assert.match(block, /availability: "platform_setup_required"/);
    assert.match(block, /connectPath: null/);
  }
  assert.match(registry, /Yelp Respond to Reviews is a Partner API/);
  assert.match(registry, /OpenTable production API access is subject to partner approval/);
  assert.match(catalog, /registry\?\.platformSetup\?\.approval/);
  assert.match(hub, /Reservations & hospitality/);
  assert.match(hub, /yelp: "Y"/);
  assert.match(hub, /opentable: "OT"/);
  assert.match(hub, /push: "PN"/);
});

test("all active business connection registry entries have a real customer route", () => {
  const registry = fs.readFileSync("lib/platform/channels/BusinessConnectionRegistry.js", "utf8");
  for (const path of [
    "/api/meta/auth",
    "/api/social/threads/auth",
    "/api/social/tiktok/auth",
    "/api/social/linkedin/auth",
    "/api/social/x/auth",
    "/api/google/auth",
    "/api/google-ads/auth",
    "/api/pinterest/auth",
    "/api/youtube/auth",
    "/api/whatsapp/auth",
    "/api/sms/auth",
    "/api/telegram/auth",
    "/api/email/auth",
    "/api/shopify/auth",
    "/api/tripadvisor/auth",
  ]) assert.match(registry, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  assert.ok(fs.existsSync("app/api/social/[provider]/auth/route.js"));
  assert.ok(fs.existsSync("app/api/social/[provider]/auth/callback/route.js"));
});

test("dynamic social OAuth gateway governs Threads TikTok LinkedIn and X with canonical channel records", () => {
  const start = fs.readFileSync("app/api/social/[provider]/auth/route.js", "utf8");
  const callback = fs.readFileSync("app/api/social/[provider]/auth/callback/route.js", "utf8");
  const runtime = fs.readFileSync("lib/platform/channels/oauth/SocialOAuthRuntime.js", "utf8");
  assert.match(runtime, /linkedin:/);
  assert.match(runtime, /tiktok:/);
  assert.match(runtime, /threads:/);
  assert.match(runtime, /x:/);
  assert.match(start, /createOAuthAuthorization/);
  assert.match(start, /createPkcePair/);
  assert.match(callback, /consumeOAuthAuthorization/);
  assert.match(callback, /CredentialRuntime\.storeSecret/);
  assert.match(callback, /ChannelConnectionRuntime\.connect/);
  assert.match(callback, /ChannelAssetRuntime\.register/);
  assert.match(callback, /OrganizationServiceRuntime/);
});

test("all channel onboarding OAuth flows use an exact same-organization return path", () => {
  const files = [
    "app/api/social/[provider]/auth/callback/route.js",
    "app/api/pinterest/auth/callback/route.js",
    "app/api/youtube/auth/callback/route.js",
    "app/api/shopify/auth/callback/route.js",
    "app/api/google/auth/callback/route.js",
    "app/api/email/google/auth/callback/route.js",
    "app/api/email/microsoft/auth/callback/route.js",
    "app/api/meta/auth/callback/route.js",
  ];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /communications-setup\?onboarding=1/);
    assert.match(source, /return_path|ReturnPath|returnPath/);
  }
});

test("provider-gated channels remain visible without exposing fake customer authorization", () => {
  const registry = fs.readFileSync("lib/platform/channels/BusinessConnectionRegistry.js", "utf8");
  for (const provider of ["yelp", "opentable", "push"]) {
    const start = registry.indexOf(`id: "${provider}"`);
    assert.ok(start >= 0);
    const block = registry.slice(start, registry.indexOf("\n  },", start) + 5);
    assert.match(block, /availability: "platform_setup_required"/);
    assert.match(block, /connectPath: null/);
  }
});

test("channel setup uses real provider logo assets where available", () => {
  const setup = fs.readFileSync("app/(system)/workspace/[organizationId]/administration/communications-setup/page.jsx", "utf8");
  assert.match(setup, /PROVIDER_LOGOS/);
  for (const asset of ["meta.svg","whatsapp.svg","line.svg","telegram.svg","threads.svg","tiktok.svg","youtube.svg","pinterest.svg","linkedin.svg","x.svg","google.svg","googleads.svg","shopify.svg","tripadvisor.svg"]) {
    assert.ok(fs.existsSync(`public/brand-icons/${asset}`));
    assert.match(setup, new RegExp(asset.replace(".", "\\.")));
  }
});

test("connected channels have a management path after onboarding", () => {
  const hub = fs.readFileSync("app/(system)/workspace/[organizationId]/administration/communications-setup/page.jsx", "utf8");
  const settings = fs.readFileSync("app/(system)/workspace/[organizationId]/administration/channel-settings/[provider]/page.jsx", "utf8");
  assert.match(hub, /administration\/channel-settings/);
  assert.match(hub, /whatsapp-connect\?onboarding=1/);
  assert.match(hub, /line-connect\?onboarding=1/);
  assert.match(hub, /email-connect\?onboarding=1/);
  assert.match(hub, /sms-setup\?onboarding=1/);
  assert.match(hub, /telegram-setup\?onboarding=1/);
  assert.match(hub, /google-business-setup\?onboarding=1/);
  assert.match(hub, /google-ads-setup\?onboarding=1/);
  assert.match(hub, /tripadvisor-connect\?onboarding=1/);
  assert.match(hub, /shopify-connect\?onboarding=1/);
  assert.match(settings, /Reconnect \/ reauthorize/);
  assert.match(settings, /Disconnect/);
  assert.match(settings, /Capabilities/);
});

test("generic channel disconnect requires management authority and deactivates the exact active credential", () => {
  const route = fs.readFileSync("app/api/platform/channels/disconnect/route.js", "utf8");
  assert.match(route, /MANAGER_ROLES/);
  assert.match(route, /Owner, administrator, or manager access is required to disconnect business channels/);
  assert.match(route, /ChannelConnectionRuntime\.get/);
  assert.match(route, /provider_credentials/);
  assert.match(route, /status: "INACTIVE"/);
  assert.match(route, /existing\.credentials_reference/);
  assert.match(route, /ChannelConnectionRuntime\.disconnect/);
});

test("progressive onboarding persists skip decisions separately from readiness evidence", () => {
  const migration = fs.readFileSync("supabase/migrations/20260924135500_organization_onboarding_progress.sql", "utf8");
  const route = fs.readFileSync("app/api/onboarding/progress/route.js", "utf8");
  const setup = fs.readFileSync("components/workspace/administration/OrganizationSetupWorkCenter.jsx", "utf8");
  assert.match(migration, /organization_onboarding_progress/);
  assert.match(migration, /'IN_PROGRESS','SKIPPED','COMPLETE'/);
  assert.match(migration, /unique \(organization_id, section_key\)/);
  assert.match(migration, /enable row level security/);
  assert.match(route, /requireOrganizationAccess/);
  assert.match(route, /workflow_state/);
  assert.match(setup, /Skip for now/);
  assert.match(setup, /Resume setup/);
  assert.match(setup, /workflow === "SKIPPED" && !configured/);
});

test("new organizations enter the progressive organization setup center after provisioning", () => {
  assert.match(provisionRoute, /`\/workspace\/\$\{result\.organization\.id\}\/administration\/onboarding`/);
  assert.doesNotMatch(provisionRoute, /commercial\/marketing\/brand\?onboarding=1/);
});

test("compact brand marks reject wide wordmarks and readiness surfaces replacement review", () => {
  const upload = fs.readFileSync("app/api/creative/brand/onboarding-upload/route.js", "utf8");
  const resolver = fs.readFileSync("lib/platform/documents/branding/BrandResolver.js", "utf8");
  const readiness = fs.readFileSync("app/api/onboarding/readiness/route.js", "utf8");
  assert.match(upload, /LOGO_ICON_MUST_BE_COMPACT/);
  assert.match(upload, /ratio < 0\.72 \|\| ratio > 1\.38/);
  assert.match(resolver, /logo_icon_valid/);
  assert.match(resolver, /logoIconAspectRatio/);
  assert.match(readiness, /Compact icon needs replacement/);
  assert.match(readiness, /needsReview/);
});

test("onboarding progress accepts only canonical setup section keys", () => {
  const route = fs.readFileSync("app/api/onboarding/progress/route.js", "utf8");
  assert.match(route, /const SECTIONS = new Set/);
  assert.match(route, /ONBOARDING_SECTION_INVALID/);
  for (const key of ["brand","modules","team","finance","people","commercial","supply_chain","operations","projects","hotel_channels","communications","payments","locations","integrations","security"]) {
    assert.match(route, new RegExp(`\\"${key}\\"`));
  }
});

test("compact icon validation returns customer-readable guidance", () => {
  const upload = fs.readFileSync("app/api/creative/brand/onboarding-upload/route.js", "utf8");
  assert.match(upload, /Logo Icon \/ Compact Mark must be square or near-square/);
  assert.match(upload, /not the full horizontal wordmark/);
});

test("all onboarding detail pages share one durable skip control", () => {
  const bar = fs.readFileSync("components/workspace/administration/OnboardingSetupReturnBar.jsx", "utf8");
  const brand = fs.readFileSync("app/(system)/workspace/[organizationId]/commercial/marketing/brand/page.jsx", "utf8");
  assert.match(bar, /SECTION_BY_PATH/);
  assert.match(bar, /workflowState:"SKIPPED"/);
  assert.match(bar, /Skip this section/);
  assert.match(bar, /router\.push\(setupHref\)/);
  assert.doesNotMatch(brand, /Skip brand for now/);
});

test("organization setup exposes only real operational surfaces for POS customer portal and Developer API", () => {
  const center = fs.readFileSync("components/workspace/administration/OrganizationSetupWorkCenter.jsx", "utf8");
  const readiness = fs.readFileSync("app/api/onboarding/readiness/route.js", "utf8");
  const progress = fs.readFileSync("app/api/onboarding/progress/route.js", "utf8");
  const returnBar = fs.readFileSync("components/workspace/administration/OnboardingSetupReturnBar.jsx", "utf8");

  assert.match(center, /\["pos", "Point of Sale", "\/operations\/pos"/);
  assert.match(center, /\["customer_portal", "Customer Portal", "\/commercial\/customers"/);
  assert.match(center, /\["developer_api", "Developer API & Webhooks", "\/developers"/);

  assert.match(readiness, /customer_portal_access_links/);
  assert.match(readiness, /developer_environments/);
  assert.match(readiness, /developer_api_credentials/);
  assert.match(readiness, /developer_webhook_endpoints/);
  assert.match(readiness, /enabled: moduleEnabled\("pos"\)/);
  assert.match(readiness, /enabled: moduleEnabled\("customer_portal"\)/);

  for (const key of ["pos", "customer_portal", "developer_api"]) {
    assert.match(progress, new RegExp(`\\"${key}\\"`));
  }
  assert.match(returnBar, /\["\/operations\/pos", "pos"\]/);
  assert.match(returnBar, /\["\/commercial\/customers", "customer_portal"\]/);
  assert.match(returnBar, /\["\/developers", "developer_api"\]/);
});

test("planned Website Builder and Mobile App Builder are not exposed as dead onboarding routes", () => {
  const center = fs.readFileSync("components/workspace/administration/OrganizationSetupWorkCenter.jsx", "utf8");
  assert.doesNotMatch(center, /website_builder|Website Builder/);
  assert.doesNotMatch(center, /mobile_app_builder|Mobile App Builder/);
});

test("organization setup includes real Documents Payroll and Roles configuration surfaces", () => {
  const center = fs.readFileSync("components/workspace/administration/OrganizationSetupWorkCenter.jsx", "utf8");
  const readiness = fs.readFileSync("app/api/onboarding/readiness/route.js", "utf8");
  const progress = fs.readFileSync("app/api/onboarding/progress/route.js", "utf8");
  const returnBar = fs.readFileSync("components/workspace/administration/OnboardingSetupReturnBar.jsx", "utf8");

  assert.match(center, /\["documents", "Documents & templates", "\/documents\/templates"/);
  assert.match(center, /\["payroll", "Payroll setup", "\/administration\/onboarding\/payroll"/);
  assert.match(center, /\["roles_permissions", "Roles & permissions", "\/administration\/roles-permissions"/);

  assert.match(readiness, /document_templates/);
  assert.match(readiness, /organization_documents/);
  assert.match(readiness, /enterprise_documents/);
  assert.match(readiness, /employee_compensation_profiles/);
  assert.match(readiness, /enabled: moduleEnabled\("payroll"\)/);
  assert.match(readiness, /role_permissions/);
  assert.match(readiness, /role_hierarchy/);
  assert.match(readiness, /operations_roles/);
  assert.match(readiness, /finance_roles/);

  for (const key of ["documents", "payroll", "roles_permissions"]) {
    assert.match(progress, new RegExp(`\\"${key}\\"`));
  }
  assert.match(returnBar, /\["\/documents", "documents"\]/);
  assert.match(returnBar, /\["\/administration\/onboarding\/payroll", "payroll"\]/);
  assert.match(returnBar, /\["\/administration\/roles-permissions", "roles_permissions"\]/);
});

test("Payroll onboarding uses the Avantiqo light setup palette", () => {
  const payroll = fs.readFileSync("app/(system)/workspace/[organizationId]/administration/onboarding/payroll/page.jsx", "utf8");
  assert.match(payroll, /bg-\[#F7F6F3\]/);
  assert.match(payroll, /bg-white/);
  assert.doesNotMatch(payroll, /bg-\[#030303\]|bg-\[#111\]|border-white\/10|text-white\//);
});

test("generic automation is not exposed until an organization-scoped setup surface exists", () => {
  const center = fs.readFileSync("components/workspace/administration/OrganizationSetupWorkCenter.jsx", "utf8");
  assert.doesNotMatch(center, /Workflows & approvals|Automation setup/);
});

test("organization setup is grouped into clear company setup phases", () => {
  const center = fs.readFileSync("components/workspace/administration/OrganizationSetupWorkCenter.jsx", "utf8");
  for (const label of ["Company foundation", "Finance & people", "Operations", "Customers & channels", "Platform, compliance & security"]) {
    assert.match(center, new RegExp(label.replace(/[&]/g, "\\&")));
  }
  assert.match(center, /configuredInGroup/);
  assert.match(center, /reviewInGroup/);
  assert.match(center, /!loading && readiness/);
});

test("Compliance is a real progressive onboarding area backed by organization-scoped evidence", () => {
  const center = fs.readFileSync("components/workspace/administration/OrganizationSetupWorkCenter.jsx", "utf8");
  const readiness = fs.readFileSync("app/api/onboarding/readiness/route.js", "utf8");
  const progress = fs.readFileSync("app/api/onboarding/progress/route.js", "utf8");
  const returnBar = fs.readFileSync("components/workspace/administration/OnboardingSetupReturnBar.jsx", "utf8");

  assert.match(center, /\["compliance", "Compliance & obligations", "\/compliance"/);
  for (const table of ["compliance_frameworks", "compliance_obligations", "compliance_controls", "compliance_risks", "compliance_issues"]) {
    assert.match(readiness, new RegExp(table));
  }
  assert.match(progress, /"compliance"/);
  assert.match(returnBar, /\["\/compliance", "compliance"\]/);
  assert.match(readiness, /needsReview: complianceIssues\.some/);
});

test("shared setup workspaces carry exact onboarding section identity", () => {
  const center = fs.readFileSync("components/workspace/administration/OrganizationSetupWorkCenter.jsx", "utf8");
  const returnBar = fs.readFileSync("components/workspace/administration/OnboardingSetupReturnBar.jsx", "utf8");
  assert.match(center, /onboardingSection=\$\{encodeURIComponent\(key\)\}/);
  assert.match(returnBar, /params\.get\("onboardingSection"\)/);
  assert.match(returnBar, /allowed\.has\(requested\) \? requested : setupSection\(pathname\)/);
});


test("Security readiness uses canonical operational settings and passkey setup stays lightweight", () => {
  const readiness = fs.readFileSync("app/api/onboarding/readiness/route.js", "utf8");
  const center = fs.readFileSync("components/workspace/administration/OrganizationSetupWorkCenter.jsx", "utf8");
  const progress = fs.readFileSync("app/api/onboarding/progress/route.js", "utf8");
  const returnBar = fs.readFileSync("components/workspace/administration/OnboardingSetupReturnBar.jsx", "utf8");

  assert.match(readiness, /rows\("operational_settings", "domain,settings,updated_at", org\)/);
  assert.doesNotMatch(readiness, /rows\("organization_policies"/);
  assert.match(readiness, /accessSettingsRow/);
  assert.match(readiness, /workforceSettingsRow/);
  assert.match(readiness, /passkey_clock_in_required/);
  assert.doesNotMatch(readiness, /loadOrganizationPasskeyReadiness/);

  assert.match(center, /\["passkeys", "Authentication & passkeys", "\/administration\/passkey-readiness"/);
  assert.match(progress, /"passkeys"/);
  assert.match(returnBar, /\["\/administration\/passkey-readiness", "passkeys"\]/);
});


test("Staff Portal is a distinct progressive setup area with lightweight activation evidence", () => {
  const center = fs.readFileSync("components/workspace/administration/OrganizationSetupWorkCenter.jsx", "utf8");
  const readiness = fs.readFileSync("app/api/onboarding/readiness/route.js", "utf8");
  const progress = fs.readFileSync("app/api/onboarding/progress/route.js", "utf8");
  const returnBar = fs.readFileSync("components/workspace/administration/OnboardingSetupReturnBar.jsx", "utf8");

  assert.match(center, /\["staff_portal", "Staff Portal", "\/people\/directory"/);
  assert.match(readiness, /auth_user_id/);
  assert.match(readiness, /portalLinkedStaff/);
  assert.match(readiness, /enabled: moduleEnabled\("hr"\)/);
  assert.match(progress, /"staff_portal"/);
  assert.match(returnBar, /\["\/people\/directory", "staff_portal"\]/);
});

test("Security and Passkey onboarding surfaces use the Avantiqo light palette", () => {
  const access = fs.readFileSync("app/(system)/workspace/[organizationId]/administration/access-policy/page.jsx", "utf8");
  const passkeys = fs.readFileSync("app/(system)/workspace/[organizationId]/administration/passkey-readiness/page.jsx", "utf8");
  for (const source of [access, passkeys]) {
    assert.match(source, /#F7F6F3/);
    assert.match(source, /bg-white/);
    assert.doesNotMatch(source, /bg-\[#030303\]|bg-\[#111\]|bg-black|border-white\/10|text-white\//);
  }
});

test("Supplier Portal is a real procurement onboarding surface with invitation and access evidence", () => {
  const center = fs.readFileSync("components/workspace/administration/OrganizationSetupWorkCenter.jsx", "utf8");
  const readiness = fs.readFileSync("app/api/onboarding/readiness/route.js", "utf8");
  const progress = fs.readFileSync("app/api/onboarding/progress/route.js", "utf8");
  const returnBar = fs.readFileSync("components/workspace/administration/OnboardingSetupReturnBar.jsx", "utf8");

  assert.match(center, /\["supplier_portal", "Supplier Portal", "\/supply-chain\/procurement\/supplier-access"/);
  assert.match(readiness, /supplier_portal_invitations/);
  assert.match(readiness, /supplier_portal_access/);
  assert.match(readiness, /enabled: moduleEnabled\("procurement"\)/);
  assert.match(progress, /"supplier_portal"/);
  assert.match(returnBar, /\["\/supply-chain\/procurement\/supplier-access", "supplier_portal"\]/);
});

test("Staff Portal origin is resolved from canonical platform hostname assets without customer-specific organization fallbacks", () => {
  const runtime = fs.readFileSync("lib/people/workforce/StaffPasskeyBrokerRuntime.js", "utf8");
  const migration = fs.readFileSync("supabase/migrations/20260924145500_seed_existing_platform_hostnames.sql", "utf8");
  assert.match(runtime, /organization_channel_assets/);
  assert.match(runtime, /channel_provider", "avantiqo/);
  assert.match(runtime, /asset_type", "platform_hostname/);
  assert.doesNotMatch(runtime, /33336a72-acb5-474e-856b-8be0269360e2/);
  assert.doesNotMatch(runtime, /9550b843-b83c-4d15-b02d-a0b5ca23346e/);
  assert.match(migration, /app\.churchillkaron\.com/);
  assert.match(migration, /coleley\.com/);
  assert.match(migration, /on conflict \(channel_provider, external_id\)/);
});

test("Staff Portal and Passkey readiness require canonical registered hostname evidence", () => {
  const readiness = fs.readFileSync("app/api/onboarding/readiness/route.js", "utf8");
  assert.match(readiness, /organization_channel_assets/);
  assert.match(readiness, /platform_hostname/);
  assert.match(readiness, /registeredStaffHostnames/);
  assert.match(readiness, /portalLinkedStaff\.length === activeStaff\.length && registeredStaffHostnames\.length > 0/);
  assert.match(readiness, /passkey_clock_in_required === "boolean" && registeredStaffHostnames\.length > 0/);
  assert.match(readiness, /registered Staff Portal hostname still required/);
});

test("Developer onboarding and shared Developer surfaces use the Avantiqo light palette", () => {
  const files = [
    "app/(system)/workspace/[organizationId]/developers/page.jsx",
    "components/workspace/developer/DeveloperPortalShell.jsx",
    "components/workspace/developer/DeveloperAccessManager.jsx",
    "components/workspace/developer/DeveloperCapabilityCatalogClient.jsx",
    "components/workspace/developer/DeveloperApiExplorer.jsx",
    "components/workspace/developer/DeveloperQuickstartClient.jsx",
    "components/workspace/developer/DeveloperControlPlaneClient.jsx",
  ];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /bg-black|bg-\[#0[0-9A-Fa-f]{5}\]|bg-\[#111|bg-\[#1D1A17\]|text-white|border-white\//);
  }
  const shell = fs.readFileSync("components/workspace/developer/DeveloperPortalShell.jsx", "utf8");
  assert.match(shell, /#F6F1E8/);
  assert.match(shell, /#EFE3D3/);
});

test("all progressive onboarding destinations and shared setup surfaces stay on the Avantiqo light palette", () => {
  const routeFiles = [
    "app/(system)/workspace/[organizationId]/commercial/marketing/brand/page.jsx",
    "app/(system)/workspace/[organizationId]/administration/modules/page.jsx",
    "app/(system)/workspace/[organizationId]/administration/business-locations/page.jsx",
    "app/(system)/workspace/[organizationId]/documents/[view]/page.jsx",
    "app/(system)/workspace/[organizationId]/administration/users/page.jsx",
    "app/(system)/workspace/[organizationId]/administration/roles-permissions/page.jsx",
    "app/(system)/workspace/[organizationId]/finance/configure/page.jsx",
    "app/(system)/workspace/[organizationId]/people/directory/page.jsx",
    "app/(system)/workspace/[organizationId]/administration/onboarding/payroll/page.jsx",
    "app/(system)/workspace/[organizationId]/supply-chain/procurement/supplier-network/page.jsx",
    "app/(system)/workspace/[organizationId]/supply-chain/procurement/supplier-access/page.jsx",
    "app/(system)/workspace/[organizationId]/operations/configuration/page.jsx",
    "app/(system)/workspace/[organizationId]/operations/pos/page.js",
    "app/(system)/workspace/[organizationId]/projects/page.jsx",
    "app/(system)/workspace/[organizationId]/operations/channel-manager/page.jsx",
    "app/(system)/workspace/[organizationId]/commercial/customers/page.jsx",
    "app/(system)/workspace/[organizationId]/administration/communications-setup/page.jsx",
    "app/(system)/workspace/[organizationId]/administration/payments/page.jsx",
    "app/(system)/workspace/[organizationId]/administration/integrations/page.jsx",
    "app/(system)/workspace/[organizationId]/administration/domains/page.jsx",
    "app/(system)/workspace/[organizationId]/compliance/page.jsx",
    "app/(system)/workspace/[organizationId]/administration/passkey-readiness/page.jsx",
    "app/(system)/workspace/[organizationId]/developers/page.jsx",
    "app/(system)/workspace/[organizationId]/administration/access-policy/page.jsx",
    "components/workspace/administration/AdministrationRecordsWorkspace.jsx",
    "components/workspace/administration/AdministrationCommandCenter.jsx",
    "components/workspace/developer/DeveloperPortalShell.jsx",
  ];
  for (const file of routeFiles) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(
      source,
      /bg-\[#(?:030303|111111|1D1A17|1F1E1B|25231F)\]|text-white\/|border-white\//,
      `${file} reintroduced legacy dark product chrome`,
    );
  }
});

test("operations onboarding never uses a hardcoded organization or dead restaurant modifier endpoints", () => {
  const page = fs.readFileSync("app/(system)/workspace/[organizationId]/operations/configuration/page.jsx", "utf8");
  assert.match(page, /useOrganizationRuntime/);
  assert.match(page, /organization\?\.id/);
  assert.doesNotMatch(page, /76e2caa6-dd78-49e5-b0f5-1ff94185c2d4/);
  assert.doesNotMatch(page, /\/api\/restaurant\/configuration\/options/);
  assert.doesNotMatch(page, /\/api\/restaurant\/modifiers\/groups/);
  assert.match(page, /\/operations\/tables\/configuration/);
  assert.match(page, /\/operations\/pos/);
});

test("every progressive onboarding destination resolves to a real App Router page and carries no hardcoded organization UUID", () => {
  const centerPath = "components/workspace/administration/OrganizationSetupWorkCenter.jsx";
  const center = fs.readFileSync(centerPath, "utf8");
  const setupBlock = center.split("const SETUP = [", 2)[1]?.split("];", 1)[0] || "";
  const routePattern = /^\s*\["([^"]+)",\s*"[^"]+",\s*"([^"]+)"/gm;
  const root = "app/(system)/workspace/[organizationId]";
  const setupRoutes = [];
  let match;
  while ((match = routePattern.exec(setupBlock))) setupRoutes.push({ key:match[1], route:match[2] });

  function resolvePage(route) {
    const parts = route.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
    let current = root;
    for (const part of parts) {
      const exact = `${current}/${part}`;
      if (fs.existsSync(exact)) { current = exact; continue; }
      const dynamic = fs.readdirSync(current, { withFileTypes:true })
        .find((entry) => entry.isDirectory() && /^\[[^\]]+\]$/.test(entry.name));
      assert.ok(dynamic, `No route segment for ${route} at ${current}/${part}`);
      current = `${current}/${dynamic.name}`;
    }
    return ["page.jsx","page.js","page.tsx","page.ts"]
      .map((name) => `${current}/${name}`)
      .find((candidate) => fs.existsSync(candidate));
  }

  assert.ok(setupRoutes.length >= 20, "Expected the full progressive onboarding registry");
  for (const { key, route } of setupRoutes) {
    const page = resolvePage(route);
    assert.ok(page, `Missing onboarding destination for ${key}: ${route}`);
    const source = fs.readFileSync(page, "utf8");
    assert.doesNotMatch(source, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i, `${key} contains a hardcoded UUID`);
  }
});

test("progressive onboarding registry stays structurally complete", () => {
  const center = fs.readFileSync("components/workspace/administration/OrganizationSetupWorkCenter.jsx", "utf8");
  const progress = fs.readFileSync("app/api/onboarding/progress/route.js", "utf8");
  const readiness = fs.readFileSync("app/api/onboarding/readiness/route.js", "utf8");
  const returnBar = fs.readFileSync("components/workspace/administration/OnboardingSetupReturnBar.jsx", "utf8");

  const setupBlock = center.split("const SETUP = [", 2)[1]?.split("];", 1)[0] || "";
  const setupKeys = [...setupBlock.matchAll(/^\s*\["([^"]+)"/gm)].map((match) => match[1]);
  const progressBlock = progress.split("const SECTIONS = new Set([", 2)[1]?.split("]);", 1)[0] || "";
  const progressKeys = new Set([...progressBlock.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]));
  const readinessBlock = readiness.split("const sections = {", 2)[1]?.split("\n    };", 1)[0] || "";
  const readinessKeys = new Set([...readinessBlock.matchAll(/^\s{6}([a-z_]+):\s*\{/gm)].map((match) => match[1]));
  const returnKeys = new Set([...returnBar.matchAll(/\["\/[^"]+",\s*"([a-z_]+)"\]/g)].map((match) => match[1]));

  assert.ok(setupKeys.length >= 20);
  for (const key of setupKeys) {
    assert.ok(progressKeys.has(key), `${key} missing from onboarding progress`);
    assert.ok(readinessKeys.has(key), `${key} missing from onboarding readiness`);
    assert.ok(returnKeys.has(key), `${key} missing from onboarding return bar`);
  }
  assert.deepEqual([...progressKeys].sort(), [...new Set(setupKeys)].sort());
});
