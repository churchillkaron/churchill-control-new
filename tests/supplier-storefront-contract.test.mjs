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
