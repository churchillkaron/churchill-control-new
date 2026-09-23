import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("supplier network profile is separate from login identity and may optionally link to a business organization", () => {
  const migration = read("supabase/migrations/20260922064000_supplier_storefront_foundation.sql");
  assert.match(migration, /supplier_portal_accounts/);
  assert.match(migration, /supplier_portal_account_members/);
  assert.match(migration, /Supplier-owned customer-facing storefront/);
  assert.match(migration, /Login identities attach through supplier_portal_account_members/);
  assert.match(migration, /business_organization_id uuid references public\.organizations/);
  assert.doesNotMatch(migration, /insert into public\.organizations/i);
});

test("supplier storefront tables default deny browser data access", () => {
  const migration = read("supabase/migrations/20260922064000_supplier_storefront_foundation.sql");
  for (const table of [
    "supplier_portal_accounts",
    "supplier_portal_account_members",
    "supplier_portal_account_relationships",
    "supplier_storefronts",
    "supplier_storefront_products",
    "supplier_storefront_relationships",
    "supplier_storefront_product_terms",
    "supplier_network_connection_requests",
    "supplier_network_customer_links",
  ]) {
    assert.match(migration, new RegExp("alter table public\\." + table + " enable row level security"));
    assert.match(migration, new RegExp("revoke all on table public\\." + table + " from anon, authenticated"));
  }
});

test("supplier storefront relationship is anchored to accepted supplier portal access", () => {
  const migration = read("supabase/migrations/20260922064000_supplier_storefront_foundation.sql");
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  assert.match(migration, /supplier_portal_access_id uuid not null unique references public\.supplier_portal_access/);
  assert.match(runtime, /\.eq\("auth_user_id", user\.id\)/);
  assert.match(runtime, /\.eq\("status", "ACTIVE"\)/);
  assert.match(runtime, /supplier_portal_access_id: access\.id/);
  assert.match(runtime, /organization_id: access\.organization_id/);
  assert.match(runtime, /supplier_party_id: access\.supplier_party_id/);
});

test("supplier operations read only ERP rows for each accepted customer relationship", () => {
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  assert.match(runtime, /from\("purchase_orders"\)/);
  assert.match(runtime, /from\("vendor_invoices"\)/);
  assert.match(runtime, /from\("vendor_payments"\)/);
  assert.match(runtime, /\.eq\("organization_id", access\.organization_id\)/);
  assert.match(runtime, /\.eq\("supplier_party_id", access\.supplier_party_id\)/);
  assert.match(runtime, /\.eq\("vendor_party_id", access\.supplier_party_id\)/);
});

test("supplier portal exposes a complete role-specific workspace shell", () => {
  const shell = read("components/supplier/SupplierPortalShell.jsx");
  for (const route of ["customers","orders","catalog","storefront","documents","payments","settings"]) {
    assert.match(shell, new RegExp("/supplier-portal/" + route));
    assert.ok(fs.existsSync("app/supplier-portal/" + route + "/page.jsx"));
  }
  assert.match(shell, /Supplier Account/);
});

test("supplier catalog and storefront have real mutation APIs", () => {
  const products = read("app/api/supplier-portal/products/route.js");
  const storefront = read("app/api/supplier-portal/storefront/route.js");
  const ui = read("components/supplier/SupplierPortalWorkspace.jsx");
  assert.match(products, /export async function POST/);
  assert.match(storefront, /export async function PATCH/);
  assert.match(ui, /Add product/);
  assert.match(ui, /Publish storefront/);
  assert.match(ui, /Allow customer orders/);
});

test("supplier capabilities are independent rather than a mutually exclusive mode enum", () => {
  const migration = read("supabase/migrations/20260922064000_supplier_storefront_foundation.sql");
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  assert.doesNotMatch(migration, /^\s*mode text/m);
  assert.match(migration, /storefront_enabled boolean/);
  assert.match(migration, /shop_discoverable boolean/);
  assert.match(migration, /business_organization_id uuid/);
  assert.match(runtime, /invited_relationships: identity\.access\.length > 0/);
  assert.match(runtime, /storefront: Boolean\(storefront\)/);
  assert.match(runtime, /business: Boolean\(account\?\.business_organization_id\)/);
});

test("free supplier shop does not require an invited customer relationship", () => {
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const storefrontRoute = read("app/api/supplier-portal/storefront/route.js");
  assert.doesNotMatch(runtime, /Active supplier portal access required/);
  assert.match(runtime, /return \{ success: true, user, access: access \|\| \[\] \}/);
  assert.match(runtime, /export async function enableSupplierStorefront/);
  assert.match(storefrontRoute, /export async function POST/);
});

test("network discovery requires a published shop", () => {
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  assert.match(runtime, /Publish the supplier shop before enabling network discovery/);
  assert.match(runtime, /storefront\.status !== "PUBLISHED"/);
});

test("business linkage reuses supplier identity and requires owner-level membership", () => {
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  assert.match(runtime, /SUPPLIER_BUSINESS_OWNER_ROLES/);
  assert.match(runtime, /organization_users/);
  assert.match(runtime, /Owner access to this Avantiqo Business is required/);
  assert.match(runtime, /business_organization_id: targetId/);
  assert.doesNotMatch(runtime, /insert\(\{[^}]*organizations/s);
});

test("supplier network exposes only published discoverable shop data to authorized businesses", () => {
  const runtime = read("lib/supplier-network/SupplierNetworkRuntime.js");
  const discoveryRuntime = runtime.split("export async function requestSupplierConnection")[0];
  const api = read("app/api/supplier-network/route.js");
  const registry = read("lib/platform/registry/erpRegistry.base.js");
  assert.match(discoveryRuntime, /\.eq\("shop_discoverable", true\)/);
  assert.match(discoveryRuntime, /\.eq\("status", "PUBLISHED"\)/);
  assert.match(discoveryRuntime, /supplier_storefront_products/);
  assert.doesNotMatch(discoveryRuntime, /supplier_storefront_product_terms/);
  assert.doesNotMatch(discoveryRuntime, /vendor_invoices/);
  assert.doesNotMatch(discoveryRuntime, /vendor_payments/);
  assert.match(api, /requireOrganizationAccess/);
  assert.match(registry, /id: "supplier_network"/);
  assert.ok(fs.existsSync("app/(system)/workspace/[organizationId]/supply-chain/procurement/supplier-network/page.jsx"));
});

test("supplier network connection is a consent handshake before customer master creation", () => {
  const migration = read("supabase/migrations/20260922064000_supplier_storefront_foundation.sql");
  const buyerRuntime = read("lib/supplier-network/SupplierNetworkRuntime.js");
  const supplierRuntime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const buyerUi = read("components/workspace/supply-chain/SupplierNetworkWorkCenter.jsx");
  const supplierUi = read("components/supplier/SupplierPortalWorkspace.jsx");

  assert.match(migration, /supplier_network_connection_requests/);
  assert.match(migration, /status text not null default 'PENDING'/);
  assert.match(migration, /supplier_network_customer_links/);
  assert.match(buyerRuntime, /requestSupplierConnection/);
  assert.match(buyerRuntime, /status: "PENDING"/);
  assert.match(buyerUi, /Request connection/);
  assert.match(supplierUi, /Businesses want to buy from you/);
  assert.match(supplierUi, /respondToConnection\(row\.id,"ACCEPT"\)/);
  assert.match(supplierRuntime, /respondToSupplierConnection/);
  assert.match(supplierRuntime, /party_type: "company"/);
  assert.match(supplierRuntime, /from\("supplier_profiles"\)/);
  assert.match(supplierRuntime, /from\("supplier_portal_access"\)/);
  assert.match(supplierRuntime, /from\("supplier_network_customer_links"\)/);
});

test("buyer connection requests require procurement or owner authority", () => {
  const api = read("app/api/supplier-network/route.js");
  assert.match(api, /CONNECTION_ROLES/);
  assert.match(api, /"PROCUREMENT"/);
  assert.match(api, /Procurement or owner authority required/);
});

test("supplier business profiles support many users and many supplier businesses per login", () => {
  const migration = read("supabase/migrations/20260922064000_supplier_storefront_foundation.sql");
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const ui = read("components/supplier/SupplierPortalWorkspace.jsx");
  assert.doesNotMatch(migration, /supplier_portal_accounts \([\s\S]*auth_user_id uuid not null unique/);
  assert.match(migration, /supplier_portal_account_members/);
  assert.match(migration, /unique \(supplier_account_id, auth_user_id\)/);
  assert.match(migration, /supplier_portal_account_members_default_user_idx/);
  assert.match(runtime, /resolveSupplierAccount/);
  assert.match(runtime, /setDefaultSupplierAccount/);
  assert.match(ui, /Active supplier profile/);
  assert.match(ui, /switchSupplierProfile/);
});

test("supplier shop and business mutations require supplier owner or admin authority", () => {
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  assert.match(runtime, /SUPPLIER_ACCOUNT_MANAGEMENT_ROLES = new Set\(\["OWNER","ADMIN"\]\)/);
  assert.match(runtime, /canManageSupplierAccount/);
  const matches = runtime.match(/Supplier owner or admin authority required/g) || [];
  assert.ok(matches.length >= 5);
});

test("switching supplier profile requires an active membership and only changes that user's default context", () => {
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const api = read("app/api/supplier-portal/profile/route.js");
  assert.match(runtime, /Active supplier profile membership required/);
  assert.match(runtime, /\.eq\("auth_user_id", identity\.user\.id\)/);
  assert.match(runtime, /\.update\(\{ is_default: false/);
  assert.match(runtime, /\.update\(\{ is_default: true/);
  assert.match(api, /export async function POST/);
  assert.match(api, /setDefaultSupplierAccount/);
});

test("customer relationships are explicitly attached to supplier business profiles before scoped ERP reads", () => {
  const migration = read("supabase/migrations/20260922064000_supplier_storefront_foundation.sql");
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const ui = read("components/supplier/SupplierPortalWorkspace.jsx");
  assert.match(migration, /supplier_portal_account_relationships/);
  assert.match(migration, /supplier_portal_access_id uuid not null unique references public\.supplier_portal_access/);
  assert.match(runtime, /supplierRelationshipScope/);
  assert.match(runtime, /scopedAccess/);
  assert.match(runtime, /unassignedAccess/);
  assert.match(runtime, /const operationalAccess = resolved\.account \? scope\.scopedAccess : identity\.access/);
  assert.match(runtime, /attachSupplierRelationship/);
  assert.match(runtime, /Supplier relationship is already attached to another supplier profile/);
  assert.match(ui, /Unassigned invitations/);
  assert.match(ui, /Attach to this supplier/);
});

test("supplier network acceptance attaches the new customer relationship to the accepting supplier profile", () => {
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  assert.match(runtime, /supplier_portal_account_relationships/);
  assert.match(runtime, /supplier_account_id: account\.id/);
  assert.match(runtime, /supplier_portal_access_id: portalAccess\.id/);
});

test("supplier catalog supports scoped product maintenance after creation", () => {
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const productsApi = read("app/api/supplier-portal/products/route.js");
  const ui = read("components/supplier/SupplierPortalWorkspace.jsx");
  assert.match(runtime, /updateSupplierStorefrontProduct/);
  assert.match(runtime, /\.eq\("storefront_id", storefront\.id\)/);
  assert.match(runtime, /typeof input\.isActive === "boolean"/);
  assert.match(productsApi, /export async function PATCH/);
  assert.match(ui, /Save changes/);
  assert.match(ui, /Deactivate/);
  assert.match(ui, /Activate/);
});

test("free shop onboarding requires a business name for self-signup and keeps invited onboarding lightweight", () => {
  const ui = read("components/supplier/SupplierPortalWorkspace.jsx");
  assert.match(ui, /Business name is required to create a free supplier shop/);
  assert.match(ui, /!capabilities\.invited_relationships/);
  assert.match(ui, /Save supplier profile/);
});

test("buyer supplier network shows connection lifecycle instead of repeated blind requests", () => {
  const api = read("app/api/supplier-network/route.js");
  const ui = read("components/workspace/supply-chain/SupplierNetworkWorkCenter.jsx");
  assert.match(api, /supplier_network_customer_links/);
  assert.match(api, /supplier_network_connection_requests/);
  assert.match(api, /status: "CONNECTED"/);
  assert.match(api, /relationship:/);
  assert.match(ui, /Request pending/);
  assert.match(ui, /Connected/);
});

test("connected supplier shop ordering creates canonical governed purchase orders", () => {
  const runtime = read("lib/supplier-network/SupplierNetworkRuntime.js");
  const route = read("app/api/supplier-network/orders/route.js");
  const ui = read("components/workspace/supply-chain/SupplierNetworkWorkCenter.jsx");
  assert.match(runtime, /createSupplierNetworkPurchaseOrder/);
  assert.match(runtime, /supplier_network_customer_links/);
  assert.match(runtime, /supplier_storefront_product_terms/);
  assert.match(runtime, /Connect with this supplier before ordering/);
  assert.match(runtime, /requires minimum order quantity/);
  assert.match(runtime, /createPurchaseOrder/);
  assert.match(runtime, /entity_id: legalEntityId/);
  assert.match(runtime, /supplier_party_id: link\.supplier_party_id/);
  assert.match(route, /Procurement or owner authority required/);
  assert.match(ui, /useBusinessContext/);
  assert.match(ui, /Create purchase order/);
  assert.match(ui, /Orders enter the normal approval workflow/);
});

test("buyer network pricing overlays only that buyer's active storefront terms", () => {
  const api = read("app/api/supplier-network/route.js");
  assert.match(api, /supplier_storefront_relationships/);
  assert.match(api, /supplier_storefront_product_terms/);
  assert.match(api, /effective_price/);
  assert.match(api, /effective_minimum_order_quantity/);
  assert.match(api, /pricing_source: term \? "CUSTOM" : "BASE"/);
});

test("supplier self-signup creates identity only and bypasses business owner onboarding", () => {
  const signup = read("app/signup/page.jsx");
  const complete = read("app/signup/complete/page.jsx");
  const login = read("app/login/page.js");
  const ownerApi = read("app/api/onboarding/self-service-owner/route.js");

  assert.match(signup, /requested === "supplier"/);
  assert.match(signup, /avantiqo_signup_intent:intent/);
  assert.match(signup, /if \(intent === "supplier"\)/);
  assert.match(signup, /window\.location\.href = "\/supplier-portal"/);
  assert.match(complete, /rawIntent==="supplier"/);
  assert.match(complete, /if\(intent==="supplier"\)/);
  assert.match(complete, /window\.location\.href="\/supplier-portal"/);
  assert.match(login, /Create a free supplier shop/);
  assert.match(login, /\/signup\?intent=supplier/);
  const signupSupplierIndex = signup.indexOf('if (intent === "supplier")');
  const signupReturnIndex = signup.indexOf('window.location.href = "/supplier-portal"', signupSupplierIndex);
  const signupBusinessFetchIndex = signup.indexOf('/api/onboarding/self-service-owner', signupSupplierIndex);
  assert.ok(signupSupplierIndex >= 0 && signupReturnIndex > signupSupplierIndex && signupBusinessFetchIndex > signupReturnIndex);
  const completeSupplierIndex = complete.indexOf('if(intent==="supplier")');
  const completeReturnIndex = complete.indexOf('window.location.href="/supplier-portal"', completeSupplierIndex);
  const completeBusinessFetchIndex = complete.indexOf('/api/onboarding/self-service-owner', completeSupplierIndex);
  assert.ok(completeSupplierIndex >= 0 && completeReturnIndex > completeSupplierIndex && completeBusinessFetchIndex > completeReturnIndex);
  assert.match(ownerApi, /supplierUpgradeAuthorized/);
});

test("public supplier shop exposes only published public base catalog data", () => {
  const runtime = read("lib/supplier-network/SupplierNetworkRuntime.js");
  const page = read("app/suppliers/[slug]/page.jsx");
  const publicFn = runtime.split("export async function getPublicSupplierShop")[1] || "";

  assert.match(publicFn, /\.eq\("status", "PUBLISHED"\)/);
  assert.match(publicFn, /\.eq\("allow_public_browse", true\)/);
  assert.match(publicFn, /supplier_storefront_products/);
  assert.match(publicFn, /\.eq\("is_active", true\)/);
  assert.doesNotMatch(publicFn, /supplier_storefront_product_terms/);
  assert.doesNotMatch(publicFn, /vendor_invoices/);
  assert.doesNotMatch(publicFn, /vendor_payments/);
  assert.match(page, /Public prices are base catalog prices only/);
  assert.match(page, /Customer-specific pricing, payment terms, orders, invoices and payments remain private/);
});

test("supplier owner and buyer network expose public shop links without changing relationship authority", () => {
  const supplierUi = read("components/supplier/SupplierPortalWorkspace.jsx");
  const buyerUi = read("components/workspace/supply-chain/SupplierNetworkWorkCenter.jsx");
  assert.match(supplierUi, /Open public shop/);
  assert.match(supplierUi, /allow_public_browse/);
  assert.match(buyerUi, /View shop/);
  assert.match(buyerUi, /\/suppliers\/\$\{supplier\.slug\}/);
});

test("business upgrade maps supplier shop products to canonical inventory without duplicating the shop", () => {
  const migration = read("supabase/migrations/20260922064000_supplier_storefront_foundation.sql");
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const api = read("app/api/supplier-portal/business/route.js");
  const ui = read("components/supplier/SupplierPortalWorkspace.jsx");

  assert.match(migration, /business_inventory_item_id uuid references public\.inventory_items/);
  assert.match(migration, /business_sync_enabled boolean/);
  assert.match(migration, /supplier_storefront_products_business_item_idx/);
  assert.match(runtime, /autoMapSupplierBusinessCatalog/);
  assert.match(runtime, /normalizedSku/);
  assert.match(runtime, /matches\.length === 1/);
  assert.match(runtime, /ambiguous \+= 1/);
  assert.match(runtime, /unmatched \+= 1/);
  assert.match(runtime, /syncSupplierBusinessCatalog/);
  assert.match(runtime, /mapSupplierProductToBusinessItem/);
  assert.match(runtime, /\.eq\("organization_id", context\.organizationId\)/);
  assert.match(api, /action === "sync_catalog"/);
  assert.match(api, /action === "map_product"/);
  assert.match(ui, /Business catalog bridge/);
  assert.match(ui, /Sync linked products/);
  assert.match(ui, /Link to Business item/);
});

test("business catalog sync changes only mapped commercial fields and preserves storefront relationship data", () => {
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const syncFn = runtime.split("async function syncMappedSupplierProducts")[1]?.split("export async function autoMapSupplierBusinessCatalog")[0] || "";
  assert.match(syncFn, /name: item\.name/);
  assert.match(syncFn, /sku: item\.code/);
  assert.match(syncFn, /base_price/);
  assert.match(syncFn, /is_active/);
  assert.doesNotMatch(syncFn, /supplier_storefront_product_terms/);
  assert.doesNotMatch(syncFn, /minimum_order_quantity:/);
  assert.doesNotMatch(syncFn, /lead_time_days:/);
  assert.doesNotMatch(syncFn, /description:/);
});

test("supplier onboarding presents three additive paths and first-time suppliers are routed into setup", () => {
  const onboarding = read("components/supplier/SupplierOnboarding.jsx");
  const workspace = read("components/supplier/SupplierPortalWorkspace.jsx");
  const shell = read("components/supplier/SupplierPortalShell.jsx");
  assert.match(onboarding, /01 · Invitation/);
  assert.match(onboarding, /02 · Free Shop/);
  assert.match(onboarding, /03 · Business/);
  assert.match(onboarding, /You can start with one capability and add the others later/);
  assert.match(onboarding, /Continue with supplier relationships/);
  assert.match(onboarding, /Create free shop/);
  assert.match(onboarding, /Start Business onboarding/);
  assert.match(workspace, /window\.location\.replace\("\/supplier-portal\/onboarding"\)/);
  assert.match(shell, /\["Setup", "\/supplier-portal\/onboarding"\]/);
  assert.ok(fs.existsSync("app/supplier-portal/onboarding/page.jsx"));
});

test("supplier business onboarding reuses the same login and requires supplier owner or admin authority", () => {
  const onboarding = read("components/supplier/SupplierOnboarding.jsx");
  const ownerApi = read("app/api/onboarding/self-service-owner/route.js");
  assert.match(onboarding, /source:"supplier_upgrade"/);
  assert.match(onboarding, /\/onboarding\?intent=business&source=supplier/);
  assert.match(ownerApi, /body\?\.source === "supplier_upgrade"/);
  assert.match(ownerApi, /supplier_portal_account_members/);
  assert.match(ownerApi, /\["OWNER","ADMIN"\]/);
  assert.match(ownerApi, /supplierUpgradeAuthorized/);
});

test("supplier onboarding keeps invited suppliers lightweight and free shop onboarding separate from ERP", () => {
  const onboarding = read("components/supplier/SupplierOnboarding.jsx");
  assert.match(onboarding, /No shop or Business subscription required/);
  assert.match(onboarding, /Full ERP remains optional/);
  assert.match(onboarding, /Avantiqo Business workspace/);
  assert.match(onboarding, /\/supplier-portal\/customers/);
  assert.match(onboarding, /\/supplier-portal\/catalog/);
  assert.doesNotMatch(onboarding.split("async function continueShop")[1]?.split("async function connectExistingBusiness")[0] || "", /self-service-owner/);
});

test("supplier Business onboarding carries the exact supplier profile through provisioning and auto-links it", () => {
  const supplierOnboarding = read("components/supplier/SupplierOnboarding.jsx");
  const businessOnboarding = read("app/(system)/onboarding/page.jsx");
  const provision = read("app/api/onboarding/provision/route.js");

  assert.match(supplierOnboarding, /supplierAccountId = snapshot\?\.account\?\.id \|\| profileResult\?\.account\?\.id/);
  assert.match(supplierOnboarding, /supplierAccountId=\$\{encodeURIComponent\(supplierAccountId\)\}/);
  assert.match(businessOnboarding, /setSupplierAccountId\(searchParams\.get\("supplierAccountId"\) \|\| ""\)/);
  assert.match(businessOnboarding, /onboardingSource,/);
  assert.match(businessOnboarding, /supplierAccountId,/);
  assert.match(provision, /body\?\.onboardingSource === "supplier"/);
  assert.match(provision, /\.eq\("supplier_account_id", supplierAccountId\)/);
  assert.match(provision, /\["OWNER","ADMIN"\]/);
  assert.match(provision, /Supplier Network profile is already linked to an Avantiqo Business/);
  assert.match(provision, /business_organization_id: result\.organization\.id/);
  assert.match(provision, /supplier-portal\/settings\?businessLinked=/);
});

test("supplier Business onboarding prefills canonical business and owner details from the supplier profile", () => {
  const businessOnboarding = read("app/(system)/onboarding/page.jsx");
  assert.match(businessOnboarding, /fetch\("\/api\/supplier-portal\/storefront"/);
  assert.match(businessOnboarding, /String\(data\?\.account\?\.id \|\| ""\) !== String\(supplierAccountId\)/);
  assert.match(businessOnboarding, /name: previous\.name \|\| data\.account\?\.business_name/);
  assert.match(businessOnboarding, /ownerName: previous\.ownerName \|\| data\.account\?\.display_name/);
  assert.match(businessOnboarding, /ownerEmail: previous\.ownerEmail \|\| data\.account\?\.email/);
  assert.match(businessOnboarding, /ownerPhone: previous\.ownerPhone \|\| data\.account\?\.phone/);
});

test("accepted supplier invitations enter Supplier Setup with the exact relationship context", () => {
  const accept = read("app/api/supplier-portal/invitations/[token]/accept/route.js");
  const onboarding = read("components/supplier/SupplierOnboarding.jsx");

  assert.match(accept, /accessId:access\.id/);
  assert.match(accept, /\/supplier-portal\/onboarding\?path=invited&accessId=/);
  assert.match(onboarding, /setInvitedAccessId\(searchParams\.get\("accessId"\) \|\| ""\)/);
  assert.match(onboarding, /supplierPortalAccessId:invitedAccessId/);
  assert.match(onboarding, /fetch\("\/api\/supplier-portal\/connections"/);
});

test("explicit invitation onboarding path is not overridden by existing supplier capabilities", () => {
  const onboarding = read("components/supplier/SupplierOnboarding.jsx");
  assert.match(onboarding, /const requestedPath=new URLSearchParams\(window\.location\.search\)\.get\("path"\)/);
  assert.match(onboarding, /if \(!\["invited","shop","business"\]\.includes\(requestedPath\)\)/);
});

test("free supplier shop onboarding continues with a live completion checklist", () => {
  const ui = read("components/supplier/SupplierPortalWorkspace.jsx");
  assert.match(ui, /const shopSetup = \{/);
  assert.match(ui, /profile: Boolean\(store\?\.account\?\.business_name\)/);
  assert.match(ui, /product: products\.some/);
  assert.match(ui, /presentation: Boolean\(store\?\.storefront\?\.name && store\?\.storefront\?\.headline\)/);
  assert.match(ui, /published: store\?\.storefront\?\.status === "PUBLISHED"/);
  assert.match(ui, /visibility: store\?\.account\?\.shop_discoverable === true \|\| store\?\.storefront\?\.allow_public_browse === true/);
  assert.match(ui, /Free shop setup/);
  assert.match(ui, /Finish your supplier shop/);
  assert.match(ui, /Your shop can remain private while you build it/);
});

test("one login can create another supplier business profile without merging companies", () => {
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const route = read("app/api/supplier-portal/profile/route.js");
  const onboarding = read("components/supplier/SupplierOnboarding.jsx");

  assert.match(runtime, /export async function createSupplierNetworkProfile/);
  assert.match(runtime, /businessName = text\(input\.business_name \?\? input\.businessName\)/);
  assert.match(runtime, /role: "OWNER"/);
  assert.match(runtime, /previousDefaultIds/);
  assert.match(runtime, /is_default: false/);
  assert.match(runtime, /setDefaultError/);
  assert.match(runtime, /\.in\("id", previousDefaultIds\)/);
  assert.match(route, /export async function PUT/);
  assert.match(route, /createSupplierNetworkProfile/);
  assert.match(onboarding, /Create another supplier profile \+/);
  assert.match(onboarding, /method:"PUT"/);
  assert.match(onboarding, /newSupplierProfileName/);
});

test("invitation onboarding requires an explicit active supplier profile when multiple supplier businesses exist", () => {
  const onboarding = read("components/supplier/SupplierOnboarding.jsx");
  assert.match(onboarding, /Attach invitation to supplier business/);
  assert.match(onboarding, /networkProfiles\.map/);
  assert.match(onboarding, /switchSupplierProfile\(membership\.supplier_account_id\)/);
  assert.match(onboarding, /The accepted customer relationship will attach only to the selected Supplier Network profile/);
});

test("supplier customer pricing terms are scoped to the active storefront relationship and product", () => {
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const readFn = runtime.split("export async function supplierCustomerTerms")[1]?.split("export async function setSupplierCustomerProductTerm")[0] || "";
  const writeFn = runtime.split("export async function setSupplierCustomerProductTerm")[1] || "";
  const route = read("app/api/supplier-portal/terms/route.js");
  const ui = read("components/supplier/SupplierPortalWorkspace.jsx");

  assert.match(readFn, /\.eq\("id", relationshipKey\)/);
  assert.match(readFn, /\.eq\("storefront_id", context\.storefront\.id\)/);
  assert.match(readFn, /supplier_storefront_product_terms/);
  assert.match(readFn, /\.eq\("relationship_id", relationship\.id\)/);

  assert.match(writeFn, /supplierStorefrontContext\(identity, \{ requireManage: true \}\)/);
  assert.match(writeFn, /\.eq\("id", relationshipId\)/);
  assert.match(writeFn, /\.eq\("storefront_id", context\.storefront\.id\)/);
  assert.match(writeFn, /\.eq\("id", productId\)/);
  assert.match(writeFn, /onConflict: "relationship_id,product_id"/);
  assert.match(runtime, /async function refreshSupplierRelationshipPricingMode/);
  assert.match(runtime, /\? "CUSTOM" : "BASE_PRICE"/);
  assert.match(writeFn, /refreshSupplierRelationshipPricingMode\(relationship\.id, context\.storefront\.id\)/);

  assert.match(route, /export async function GET/);
  assert.match(route, /export async function PATCH/);
  assert.match(ui, /Pricing & terms/);
  assert.match(ui, /Private customer terms/);
  assert.match(ui, /Customer price/);
  assert.match(ui, /Customer MOQ/);
  assert.match(ui, /Use base/);
  assert.match(ui, /These overrides apply only to this connected customer/);
});

test("removing the last active customer override resets that relationship to base pricing", () => {
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const helper = runtime.split("async function refreshSupplierRelationshipPricingMode")[1]?.split("export async function setSupplierCustomerProductTerm")[0] || "";
  const writeFn = runtime.split("export async function setSupplierCustomerProductTerm")[1] || "";
  assert.match(helper, /\.eq\("relationship_id", relationshipId\)/);
  assert.match(helper, /\.eq\("is_active", true\)/);
  assert.match(helper, /\? "CUSTOM" : "BASE_PRICE"/);
  assert.match(helper, /\.eq\("id", relationshipId\)/);
  assert.match(helper, /\.eq\("storefront_id", storefrontId\)/);
  assert.match(writeFn, /if \(customerPrice === null && minimumOrderQuantity === null\)/);
  assert.match(writeFn, /refreshSupplierRelationshipPricingMode\(relationship\.id, context\.storefront\.id\)/);
});

test("supplier customer pricing terms are customer-scoped and owner-admin managed", () => {
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const api = read("app/api/supplier-portal/terms/route.js");
  const ui = read("components/supplier/SupplierPortalWorkspace.jsx");

  assert.match(runtime, /export async function supplierCustomerTerms/);
  assert.match(runtime, /export async function setSupplierCustomerProductTerm/);
  assert.match(runtime, /supplierStorefrontContext\(identity, \{ requireManage: true \}\)/);
  assert.match(runtime, /\.eq\("id", relationshipKey\)/);
  assert.match(runtime, /\.eq\("storefront_id", context\.storefront\.id\)/);
  assert.match(runtime, /\.eq\("id", productId\)/);
  assert.match(runtime, /Scoped supplier relationship or product not found/);
  assert.match(api, /export async function GET/);
  assert.match(api, /export async function PATCH/);
  assert.match(ui, /Pricing & terms/);
  assert.match(ui, /Private customer terms/);
  assert.match(ui, /These overrides apply only to this connected customer/);
});

test("supplier customer pricing reverts cleanly to base pricing", () => {
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  assert.match(runtime, /async function refreshSupplierRelationshipPricingMode/);
  assert.match(runtime, /\.eq\("is_active", true\)/);
  assert.match(runtime, /\? "CUSTOM" : "BASE_PRICE"/);
  assert.match(runtime, /if \(customerPrice === null && minimumOrderQuantity === null\)/);
  assert.match(runtime, /useBase === true/);
  assert.match(runtime, /refreshSupplierRelationshipPricingMode\(relationship\.id, context\.storefront\.id\)/);
});

test("supplier negotiated terms remain private from public shop and buyer receives only own relationship overlay", () => {
  const supplierRuntime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const publicRuntime = read("lib/supplier-network/SupplierNetworkRuntime.js");
  const networkApi = read("app/api/supplier-network/route.js");
  const publicFn = publicRuntime.split("export async function getPublicSupplierShop")[1] || "";

  assert.match(supplierRuntime, /supplier_storefront_product_terms/);
  assert.doesNotMatch(publicFn, /supplier_storefront_product_terms/);
  assert.match(networkApi, /supplier_storefront_product_terms/);
  assert.match(networkApi, /effective_price/);
  assert.match(networkApi, /effective_minimum_order_quantity/);
});

test("supplier order response layer keeps buyer PO status and supplier fulfillment separate", () => {
  const migration = read("supabase/migrations/20260922070243_supplier_order_response_layer.sql");
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const api = read("app/api/supplier-portal/operations/route.js");
  const ui = read("components/supplier/SupplierPortalWorkspace.jsx");

  assert.match(migration, /supplier_purchase_order_responses/);
  assert.match(migration, /PENDING','ACKNOWLEDGED','DECLINED','IN_FULFILLMENT','DISPATCHED/);
  assert.match(migration, /Buyer purchase_order status and customer receiving remain customer-controlled/);
  assert.match(runtime, /SUPPLIER_PURCHASE_ORDER_RESPONSE_TRANSITIONS/);
  assert.match(runtime, /PENDING: new Set\(\["ACKNOWLEDGED", "DECLINED"\]\)/);
  assert.match(runtime, /ACKNOWLEDGED: new Set\(\["IN_FULFILLMENT"\]\)/);
  assert.match(runtime, /IN_FULFILLMENT: new Set\(\["DISPATCHED"\]\)/);
  assert.match(runtime, /String\(purchaseOrder\.status \|\| ""\)\.toUpperCase\(\) !== "APPROVED"/);
  assert.match(runtime, /Customer approval is required before the supplier can respond/);
  assert.match(api, /export async function PATCH/);
  assert.match(ui, /Acknowledge order/);
  assert.match(ui, /Start fulfillment/);
  assert.match(ui, /Mark dispatched/);
  assert.match(ui, /Awaiting customer approval/);
});

test("supplier operational snapshot returns only response records scoped to the active profile and customer access", () => {
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const snapshotFn = runtime.split("export async function supplierOperationalSnapshot")[1]?.split("const SUPPLIER_BUSINESS_OWNER_ROLES")[0] || "";
  assert.match(snapshotFn, /supplier_purchase_order_responses/);
  assert.match(snapshotFn, /\.eq\("supplier_account_id", resolved\.account\.id\)/);
  assert.match(snapshotFn, /\.eq\("supplier_portal_access_id", access\.id\)/);
  assert.match(snapshotFn, /\.eq\("organization_id", access\.organization_id\)/);
  assert.match(snapshotFn, /supplier_response:/);
});

test("customer purchase order list exposes supplier response under organization authorization only", () => {
  const route = read("app/api/procurement/purchase-orders/list/route.js");
  const page = read("app/(system)/procurement/purchase-orders/page.jsx");
  assert.match(route, /async function attachSupplierResponses/);
  assert.match(route, /supplier_purchase_order_responses/);
  assert.match(route, /\.eq\("organization_id", organizationId\)/);
  assert.match(route, /supplier_response:/);
  assert.match(page, /Supplier · \{order\.supplier_response\?\.response_status/);
  assert.match(page, /Promised \{order\.supplier_response\.promised_delivery_date\}/);
  assert.match(page, /Dispatch \{order\.supplier_response\.dispatch_reference\}/);
  assert.match(page, /Supplier note/);
});

test("purchase order approval audit timestamp exists before supplier acknowledgement depends on APPROVED state", () => {
  const migration = read("supabase/migrations/20260922141000_purchase_orders_approved_at.sql");
  const approval = read("lib/inventory/procurement/purchase-orders/workflows/approvePurchaseOrder.js");
  assert.match(migration, /alter table public\.purchase_orders/);
  assert.match(migration, /add column if not exists approved_at timestamptz/);
  assert.match(approval, /status:\s*"APPROVED"/);
  assert.match(approval, /approved_at:/);
});

test("supplier invoice intake is evidence and review only, never direct accounting", () => {
  const migration = read("supabase/migrations/20260922075111_supplier_invoice_submissions.sql");
  const supplierRoute = read("app/api/supplier-portal/invoices/route.js");
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const ui = read("components/supplier/SupplierPortalWorkspace.jsx");

  assert.match(migration, /supplier_invoice_submissions/);
  assert.match(migration, /SUBMITTED','UNDER_REVIEW','ACCEPTED','REJECTED','CONVERTED/);
  assert.match(migration, /does not post accounting/);
  assert.match(migration, /alter table public\.supplier_invoice_submissions enable row level security/);
  assert.match(migration, /revoke all on table public\.supplier_invoice_submissions from anon, authenticated/);
  assert.match(runtime, /export async function supplierInvoiceSubmissionContext/);
  assert.match(runtime, /\["APPROVED","RECEIVED"\]\.includes\(poStatus\)/);
  assert.match(runtime, /Purchase order is outside this Supplier relationship/);
  assert.match(supplierRoute, /approval_required: true/);
  assert.match(supplierRoute, /financial_impact: true/);
  assert.match(supplierRoute, /destination_module: "finance\.accounts_payable"/);
  assert.match(supplierRoute, /status: "SUBMITTED"/);
  assert.doesNotMatch(supplierRoute, /from\("vendor_invoices"\)/);
  assert.doesNotMatch(supplierRoute, /createVendorInvoice/);
  assert.doesNotMatch(supplierRoute, /finance_post_journal/);
  assert.match(ui, /Submitting here does not post accounting/);
  assert.match(ui, /Submit to customer Finance/);
});

test("supplier invoice uploads enforce scoped evidence and safe file rules", () => {
  const route = read("app/api/supplier-portal/invoices/route.js");
  assert.match(route, /MAX_FILE_BYTES = 20 \* 1024 \* 1024/);
  assert.match(route, /application\/pdf/);
  assert.match(route, /image\/jpeg/);
  assert.match(route, /image\/png/);
  assert.match(route, /typeof file\.arrayBuffer !== "function"/);
  assert.match(route, /supplierInvoiceSubmissionContext/);
  assert.match(route, /SUPPLIER_INVOICE_BUCKET = "supplier-finance-evidence"/);
  assert.match(route, /storage:\/\/\$\{SUPPLIER_INVOICE_BUCKET\}\/\$\{storagePath\}/);
  assert.match(route, /signedStorageReference\(document\.file_url\)/);
  assert.doesNotMatch(route, /getPublicUrl/);
  assert.doesNotMatch(route, /\.from\("uploads"\)/);
  assert.match(route, /submitted_by_auth_user_id: context\.identity\.user\.id/);
});

test("customer Finance review uses finance view and payables manage permissions", () => {
  const route = read("app/api/finance/supplier-invoice-submissions/route.js");
  const desk = read("components/workspace/finance/FinanceBooksDesk.jsx");
  assert.match(route, /permissionKey: "finance\.view"/);
  assert.match(route, /permissionKey: "finance\.payables\.manage"/);
  assert.match(route, /START_REVIEW/);
  assert.match(route, /ACCEPT/);
  assert.match(route, /REJECT/);
  assert.match(route, /CONVERT/);
  assert.match(route, /accounting_posted: action === "CONVERT"/);
  assert.match(route, /Prepare canonical vendor invoice through Finance AP/);
  assert.doesNotMatch(route, /createVendorInvoice/);
  assert.doesNotMatch(route, /finance_post_journal/);
  assert.match(desk, /Supplier invoice inbox/);
  assert.match(desk, /Accept into AP/);
  assert.match(desk, /Ready for canonical AP creation/);
});

test("supplier invoice submissions keep evidence linked to the canonical organization document", () => {
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const supplierFn = runtime.split("export async function supplierInvoiceSubmissions")[1] || "";
  assert.match(supplierFn, /organization_document_id/);
  assert.match(supplierFn, /organization_documents/);
  assert.match(supplierFn, /\.in\("organization_id", organizationIds\)/);
  assert.match(supplierFn, /document:/);
});

test("canonical Vendor lookup returns the supplier party id expected by Finance APIs", () => {
  const lookup = read("lib/platform/erp-engine/lookups/providers/VendorLookup.js");
  const form = read("components/workspace/engines/DynamicForm.jsx");
  assert.match(lookup, /value: party\?\.id \|\| row\.supplier_party_id \|\| row\.party_id \|\| row\.id/);
  assert.match(lookup, /supplier_profile_id: row\.id/);
  assert.match(lookup, /supplier_party_id: party\?\.id/);
  assert.match(form, /case "vendor"/);
  assert.match(form, /lookup: "vendors"/);
});

test("Vendor Bill form requires canonical currency and invoice lines", () => {
  const forms = read("lib/platform/forms/FormRegistry.js");
  const vendorBill = forms.split('"vendor-bill":')[1]?.split('"wallet-topup":')[0] || "";
  assert.match(vendorBill, /name: "currency_code"/);
  assert.match(vendorBill, /lookup: "currencies"/);
  assert.match(vendorBill, /name: "lines"/);
  assert.match(vendorBill, /required: true/);
});

test("accepted supplier invoice handoff prefills only the governed canonical Vendor Bill form", () => {
  const desk = read("components/workspace/finance/FinanceBooksDesk.jsx");
  const workCenter = read("components/workspace/finance/FinanceAccountantRecordsWorkCenter.jsx");
  assert.match(desk, /Create canonical Vendor Bill/);
  assert.match(desk, /supplierSubmissionId=/);
  assert.match(workCenter, /capability\?\.id !== "vendor_bills"/);
  assert.match(workCenter, /Supplier invoice submission must be accepted before Vendor Bill creation/);
  assert.match(workCenter, /supplier-submission:\$\{submission\.id\}/);
  assert.match(workCenter, /vendor: submission\.supplier_party_id/);
  assert.match(workCenter, /purchase_order_id: submission\.purchase_order_id/);
  assert.match(workCenter, /document_id: submission\.organization_document_id/);
  assert.match(workCenter, /source: "supplier_portal_submission"/);
  assert.match(workCenter, /supplier_submission_id: submission\.id/);
  assert.match(workCenter, /unit_price: Number\(submission\.total_amount \|\| 0\)/);
});

test("supplier submission becomes CONVERTED only after a verified canonical Vendor Bill exists", () => {
  const route = read("app/api/finance/supplier-invoice-submissions/route.js");
  const workCenter = read("components/workspace/finance/FinanceAccountantRecordsWorkCenter.jsx");
  assert.match(route, /ACCEPTED: new Set\(\["CONVERT"\]\)/);
  assert.match(route, /Canonical Vendor Bill supplier does not match the supplier submission/);
  assert.match(route, /Canonical Vendor Bill invoice number does not match the supplier submission/);
  assert.match(route, /Canonical Vendor Bill total does not match the supplier submission/);
  assert.match(route, /Canonical Vendor Bill currency does not match the supplier submission/);
  assert.match(route, /canonical_vendor_invoice_id = canonicalVendorInvoiceId|canonical_vendor_invoice_id: canonicalVendorInvoiceId/);
  assert.match(workCenter, /action: "CONVERT"/);
  assert.match(workCenter, /canonicalVendorInvoiceId/);
  assert.match(workCenter, /supplierSubmissionId/);
  assert.match(workCenter, /window\.history\.replaceState/);
});

test("single-submission Finance prefill requires payables-manage permission", () => {
  const route = read("app/api/finance/supplier-invoice-submissions/route.js");
  assert.match(route, /if \(submissionId\) await requirePayablesManage\(access\)/);
  assert.match(route, /else await requireFinanceView\(access\)/);
});

test("supplier team management is Supplier Network only and never creates internal staff membership", () => {
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const teamBlock = runtime.split("function normalizeSupplierTeamEmail")[1] || "";
  const route = read("app/api/supplier-portal/team/route.js");

  assert.match(teamBlock, /supplierTeamManageContext/);
  assert.match(teamBlock, /canManageSupplierAccount/);
  assert.match(teamBlock, /Supplier owner or admin authority required/);
  assert.match(teamBlock, /supplier_portal_account_members/);
  assert.match(teamBlock, /role: normalizedRole/);
  assert.match(teamBlock, /\["ADMIN","MEMBER"\]/);
  assert.doesNotMatch(teamBlock, /organization_users/);
  assert.doesNotMatch(teamBlock, /staff_accounts/);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function PATCH/);
});

test("supplier team invitations reuse existing auth identities or create invite-only identities safely", () => {
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const teamBlock = runtime.split("function normalizeSupplierTeamEmail")[1] || "";

  assert.match(teamBlock, /auth\.admin\.listUsers/);
  assert.match(teamBlock, /auth\.signInWithOtp/);
  assert.match(teamBlock, /shouldCreateUser: false/);
  assert.match(teamBlock, /auth\.admin\.inviteUserByEmail/);
  assert.match(teamBlock, /supplier_network_team: true/);
  assert.match(teamBlock, /supplier_account_id: context\.account\.id/);
  assert.match(teamBlock, /auth\.admin\.deleteUser\(invitedUser\.id\)/);
  assert.match(teamBlock, /status: "INACTIVE"/);
});

test("supplier team owner and current-user access are protected", () => {
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const teamBlock = runtime.split("export async function updateSupplierTeamMember")[1] || "";
  const ui = read("components/supplier/SupplierPortalWorkspace.jsx");

  assert.match(teamBlock, /Supplier OWNER membership cannot be modified from team management/);
  assert.match(teamBlock, /Use another Supplier OWNER or ADMIN to change your own team access/);
  assert.match(ui, /Owner access protected/);
  assert.match(ui, /Current-user access protected/);
  assert.match(ui, /Supplier team access is limited to this Supplier Network profile/);
  assert.match(ui, /does not create Staff Portal access, organization membership, or internal Avantiqo Business workspace access/);
});

test("supplier Settings exposes invite role and deactivate controls only to supplier managers", () => {
  const ui = read("components/supplier/SupplierPortalWorkspace.jsx");
  assert.match(ui, /canManageSupplier \? <Panel eyebrow="Supplier team"/);
  assert.match(ui, /Invite teammate/);
  assert.match(ui, /<option value="MEMBER">Member<\/option>/);
  assert.match(ui, /<option value="ADMIN">Admin<\/option>/);
  assert.match(ui, /updateSupplierTeamAccess\(row\.id,\{role:event\.target\.value\}\)/);
  assert.match(ui, /updateSupplierTeamAccess\(row\.id,\{active:status!=="ACTIVE"\}\)/);
});

test("storefront sync never pulls customer relationships from another supplier profile on the same login", () => {
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const ensureFn = runtime.split("export async function ensureSupplierStorefront")[1]?.split("export async function syncSupplierStorefrontRelationships")[0] || "";
  const snapshotFn = runtime.split("export async function supplierStorefrontSnapshot")[1]?.split("export async function updateSupplierStorefront")[0] || "";
  const attachFn = runtime.split("export async function attachSupplierRelationship")[1]?.split("export async function updateSupplierStorefrontProduct")[0] || "";

  assert.match(ensureFn, /supplierRelationshipScope\(identity, account\)/);
  assert.match(ensureFn, /access: relationshipScope\.scopedAccess/);
  assert.doesNotMatch(ensureFn, /syncSupplierStorefrontRelationships\(identity, storefront\.id\)/);
  assert.doesNotMatch(snapshotFn, /syncSupplierStorefrontRelationships/);
  assert.match(attachFn, /access: \[access\]/);
  assert.match(attachFn, /Supplier relationship is already attached to another supplier profile/);
});

test("supplier storefront snapshot is read-only with respect to relationship assignment", () => {
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const snapshotFn = runtime.split("export async function supplierStorefrontSnapshot")[1]?.split("export async function updateSupplierStorefront")[0] || "";
  assert.match(snapshotFn, /supplierRelationshipScope\(identity, account\)/);
  assert.match(snapshotFn, /supplier_storefront_relationships/);
  assert.doesNotMatch(snapshotFn, /\.insert\(/);
  assert.doesNotMatch(snapshotFn, /\.upsert\(/);
  assert.doesNotMatch(snapshotFn, /\.update\(/);
});

test("supplier discovery metadata is normalized, searchable and visible without changing authority", () => {
  const migration = read("supabase/migrations/20260922081500_supplier_discovery_metadata.sql");
  const portalRuntime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const networkRuntime = read("lib/supplier-network/SupplierNetworkRuntime.js");
  const onboarding = read("components/supplier/SupplierOnboarding.jsx");
  const settings = read("components/supplier/SupplierPortalWorkspace.jsx");
  const buyer = read("components/workspace/supply-chain/SupplierNetworkWorkCenter.jsx");
  const publicShop = read("app/suppliers/[slug]/page.jsx");

  assert.match(migration, /supplier_categories text\[\]/);
  assert.match(migration, /service_areas text\[\]/);
  assert.match(migration, /using gin\(supplier_categories\)/);
  assert.match(migration, /using gin\(service_areas\)/);
  assert.match(portalRuntime, /function discoveryTags/);
  assert.match(portalRuntime, /supplier_categories = discoveryTags|patch\.supplier_categories = discoveryTags/);
  assert.match(portalRuntime, /service_areas = discoveryTags|patch\.service_areas = discoveryTags/);
  assert.match(networkRuntime, /supplier_categories,service_areas/);
  assert.match(networkRuntime, /row\.supplier\?\.categories/);
  assert.match(networkRuntime, /row\.supplier\?\.service_areas/);
  assert.match(onboarding, /Supplier categories/);
  assert.match(onboarding, /Service \/ delivery areas/);
  assert.match(settings, /Used for Supplier Network discovery/);
  assert.match(buyer, /supplier\.supplier\?\.categories/);
  assert.match(buyer, /supplier\.supplier\?\.service_areas/);
  assert.match(publicShop, /shop\.supplier\?\.categories/);
  assert.match(publicShop, /shop\.supplier\?\.service_areas/);
});

test("supplier profile PATCH is partial so discovery toggles cannot erase supplier profile details", () => {
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const fn = runtime.split("export async function updateSupplierNetworkProfile")[1]?.split("export async function supplierBusinessCandidates")[0] || "";
  assert.match(fn, /Object\.prototype\.hasOwnProperty\.call\(input, "phone"\)/);
  assert.match(fn, /Object\.prototype\.hasOwnProperty\.call\(input, "website"\)/);
  assert.match(fn, /Object\.prototype\.hasOwnProperty\.call\(input, "supplier_categories"\)/);
  assert.match(fn, /Object\.prototype\.hasOwnProperty\.call\(input, "service_areas"\)/);
  assert.match(fn, /typeof input\.shop_discoverable === "boolean"/);
  assert.doesNotMatch(fn, /phone: text\(input\.phone\) \|\| null/);
  assert.doesNotMatch(fn, /website: text\(input\.website\) \|\| null/);
});

test("Supplier Network discovery supports multi-token searches across category and service area", () => {
  const runtime = read("lib/supplier-network/SupplierNetworkRuntime.js");
  const searchFn = runtime.split("export async function searchSupplierNetwork")[1]?.split("export async function requestSupplierConnection")[0] || "";
  assert.match(searchFn, /const tokens = normalized\.split\(\/\\s\+\/g\)\.filter\(Boolean\)/);
  assert.match(searchFn, /tokens\.every\(\(token\) => haystack\.includes\(token\)\)/);
  assert.match(searchFn, /row\.supplier\?\.categories/);
  assert.match(searchFn, /row\.supplier\?\.service_areas/);
});

test("supplier connection requests notify the supplier without making email delivery transactional", () => {
  const runtime = read("lib/supplier-network/SupplierNetworkRuntime.js");
  const notification = read("lib/supplier-network/SupplierNetworkNotificationRuntime.js");

  assert.match(runtime, /deliverSupplierConnectionRequestEmail/);
  assert.match(runtime, /status: "PENDING"/);
  assert.match(runtime, /let notification = \{ sent: false, status: "SKIPPED"/);
  assert.match(runtime, /catch \(notificationError\)/);
  assert.match(runtime, /return \{ success: true, connected: false, request, notification \}/);
  assert.match(notification, /communication\.email\.send/);
  assert.match(notification, /SUPPLIER_NETWORK_CONNECTION_REQUEST_EMAIL/);
  assert.match(notification, /NO_ORGANIZATION_EMAIL_PROVIDER/);
  assert.match(notification, /Accepting the connection creates only the governed customer-supplier relationship/);
});

test("supplier connection responses notify the exact buyer requester after the governed state change", () => {
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const notification = read("lib/supplier-network/SupplierNetworkNotificationRuntime.js");

  assert.match(runtime, /notifyBuyerOfSupplierConnectionResponse/);
  assert.match(runtime, /requestRow\?\.requested_by_auth_user_id/);
  assert.match(runtime, /supabaseAdmin\.auth\.admin\.getUserById\(requesterId\)/);
  assert.match(runtime, /status: "DECLINED"/);
  assert.match(runtime, /status: "ACCEPTED"/);
  assert.match(runtime, /return \{ success: true, request: data, notification \}/);
  assert.match(runtime, /supplier_profile: supplierProfile, notification/);
  assert.match(notification, /SUPPLIER_NETWORK_CONNECTION_RESPONSE_EMAIL/);
  assert.match(notification, /\/procurement\/supplier-network/);
  assert.match(notification, /No supplier relationship was created/);
  assert.match(notification, /governed supplier relationship is now connected/);
});

test("supplier storefront media is supplier-scoped, image-only and visible across shop surfaces", () => {
  const migration = read("supabase/migrations/20260922083000_supplier_storefront_media.sql");
  const runtime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const route = read("app/api/supplier-portal/media/route.js");
  const supplierUi = read("components/supplier/SupplierPortalWorkspace.jsx");
  const network = read("lib/supplier-network/SupplierNetworkRuntime.js");
  const buyerUi = read("components/workspace/supply-chain/SupplierNetworkWorkCenter.jsx");
  const publicShop = read("app/suppliers/[slug]/page.jsx");

  assert.match(migration, /add column if not exists logo_url text/);
  assert.match(migration, /add column if not exists image_url text/);
  assert.match(runtime, /export async function supplierMediaUploadContext/);
  assert.match(runtime, /Supplier owner or admin authority required/);
  assert.match(runtime, /patch\.logo_url/);
  assert.match(runtime, /image_url: text\(input\.image_url \?\? input\.imageUrl\)/);
  assert.match(route, /MAX_IMAGE_BYTES = 8 \* 1024 \* 1024/);
  assert.match(route, /image\/jpeg/);
  assert.match(route, /image\/png/);
  assert.match(route, /image\/webp/);
  assert.match(route, /supplier-storefronts\/\$\{context\.account\.id\}/);
  assert.match(supplierUi, /Supplier logo/);
  assert.match(supplierUi, /Product image/);
  assert.match(network, /logo_url/);
  assert.match(network, /image_url/);
  assert.match(buyerUi, /supplier\.supplier\?\.logo_url/);
  assert.match(buyerUi, /product\.image_url/);
  assert.match(publicShop, /shop\.supplier\?\.logo_url/);
  assert.match(publicShop, /product\.image_url/);
});

test("supplier financial evidence is stored in a dedicated private bucket and exposed only by signed URLs", () => {
  const migration = read("supabase/migrations/20260922165500_supplier_finance_evidence_bucket.sql");
  const helper = read("lib/shared/storage/privateDocumentUrl.js");
  const supplierRoute = read("app/api/supplier-portal/invoices/route.js");
  const supplierRuntime = read("lib/supplier-portal/SupplierStorefrontRuntime.js");
  const financeRoute = read("app/api/finance/supplier-invoice-submissions/route.js");

  assert.match(migration, /supplier-finance-evidence/);
  assert.match(migration, /false,/);
  assert.match(migration, /20971520/);
  assert.match(helper, /createSignedUrl/);
  assert.match(helper, /900/);
  assert.match(supplierRoute, /signedStorageReference/);
  assert.match(supplierRuntime, /signedStorageReference\(document\.file_url\)/);
  assert.match(financeRoute, /signedStorageReference\(document\.file_url\)/);
  assert.doesNotMatch(supplierRoute, /getPublicUrl/);
});
