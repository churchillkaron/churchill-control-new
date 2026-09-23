import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { signedStorageReference } from "@/lib/shared/storage/privateDocumentUrl";
import { deliverSupplierConnectionResponseEmail } from "@/lib/supplier-network/SupplierNetworkNotificationRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function slugPart(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function discoveryTags(value) {
  const source = Array.isArray(value)
    ? value
    : String(value ?? "").split(/[\n,;]/g);
  const seen = new Set();
  const result = [];
  for (const raw of source) {
    const tag = String(raw ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
    if (result.length >= 24) break;
  }
  return result;
}

export async function requireSupplierPortalIdentity() {
  const user = await getServerCurrentUser();
  if (!user?.id) {
    return { success: false, status: 401, error: "Authentication required" };
  }

  const { data: access, error } = await supabaseAdmin
    .from("supplier_portal_access")
    .select("id,organization_id,supplier_profile_id,supplier_party_id,email,status")
    .eq("auth_user_id", user.id)
    .eq("status", "ACTIVE");

  if (error) throw error;
  return { success: true, user, access: access || [] };
}
export async function resolveSupplierAccount(identity) {
  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from("supplier_portal_account_members")
    .select("supplier_account_id,role,status,is_default")
    .eq("auth_user_id", identity.user.id)
    .eq("status", "ACTIVE")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (membershipError) throw membershipError;
  if (!(memberships || []).length) return { account: null, membership: null, memberships: [] };

  const accountIds = [...new Set((memberships || []).map((row) => row.supplier_account_id).filter(Boolean))];
  const { data: accounts, error: accountError } = await supabaseAdmin
    .from("supplier_portal_accounts")
    .select("*")
    .in("id", accountIds);
  if (accountError) throw accountError;
  const accountById = new Map((accounts || []).map((row) => [String(row.id), row]));
  const activeMembership = (memberships || []).find((row) => accountById.has(String(row.supplier_account_id))) || null;
  return {
    account: activeMembership ? accountById.get(String(activeMembership.supplier_account_id)) || null : null,
    membership: activeMembership,
    memberships: (memberships || []).map((row) => ({
      ...row,
      account: accountById.get(String(row.supplier_account_id)) || null,
    })),
  };
}


async function supplierRelationshipScope(identity, account) {
  if (!account) {
    return {
      scopedAccess: identity.access || [],
      unassignedAccess: identity.access || [],
      assignments: [],
    };
  }

  const accessIds = (identity.access || []).map((row) => row.id).filter(Boolean);
  if (!accessIds.length) return { scopedAccess: [], unassignedAccess: [], assignments: [] };

  const { data: assignments, error } = await supabaseAdmin
    .from("supplier_portal_account_relationships")
    .select("supplier_account_id,supplier_portal_access_id")
    .in("supplier_portal_access_id", accessIds);
  if (error) throw error;

  const assignmentByAccess = new Map(
    (assignments || []).map((row) => [String(row.supplier_portal_access_id), row])
  );
  const scopedAccess = (identity.access || []).filter((row) =>
    String(assignmentByAccess.get(String(row.id))?.supplier_account_id || "") === String(account.id)
  );
  const unassignedAccess = (identity.access || []).filter((row) => !assignmentByAccess.has(String(row.id)));

  return { scopedAccess, unassignedAccess, assignments: assignments || [] };
}

const SUPPLIER_ACCOUNT_MANAGEMENT_ROLES = new Set(["OWNER","ADMIN"]);

function canManageSupplierAccount(resolved) {
  return SUPPLIER_ACCOUNT_MANAGEMENT_ROLES.has(String(resolved?.membership?.role || "").trim().toUpperCase());
}

export async function ensureSupplierAccount(identity) {
  const resolved = await resolveSupplierAccount(identity);
  if (resolved.account) return resolved.account;

  const email = text(identity.user?.email || identity.access?.[0]?.email).toLowerCase();
  if (!email) {
    throw new Error("Supplier account requires an email address");
  }

  let party = {};
  const partyIds = identity.access.map((row) => row.supplier_party_id).filter(Boolean);
  if (partyIds.length) {
    const { data: parties, error: partyError } = await supabaseAdmin
      .from("parties")
      .select("display_name,legal_name,email,phone")
      .in("id", partyIds);
    if (partyError) throw partyError;
    party = (parties || [])[0] || {};
  }

  const { data: account, error } = await supabaseAdmin
    .from("supplier_portal_accounts")
    .insert({
      email,
      display_name: party.display_name || party.legal_name || identity.user?.user_metadata?.full_name || null,
      business_name: party.legal_name || party.display_name || null,
      phone: party.phone || null,
    })
    .select("*")
    .single();
  if (error) throw error;

  const { error: memberError } = await supabaseAdmin
    .from("supplier_portal_account_members")
    .insert({
      supplier_account_id: account.id,
      auth_user_id: identity.user.id,
      role: "OWNER",
      status: "ACTIVE",
      is_default: true,
    });
  if (memberError) throw memberError;

  if ((identity.access || []).length === 1) {
    const { error: relationshipError } = await supabaseAdmin
      .from("supplier_portal_account_relationships")
      .upsert({
        supplier_account_id: account.id,
        supplier_portal_access_id: identity.access[0].id,
        attached_by_auth_user_id: identity.user.id,
      }, { onConflict: "supplier_portal_access_id" });
    if (relationshipError) throw relationshipError;
  }
  return account;
}

async function uniqueStorefrontSlug(base) {
  const root = slugPart(base) || "supplier";
  for (let index = 0; index < 20; index += 1) {
    const candidate = index ? `${root}-${index + 1}` : root;
    const { data, error } = await supabaseAdmin
      .from("supplier_storefronts")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}
export async function ensureSupplierStorefront(identity) {
  const account = await ensureSupplierAccount(identity);
  const { data: existing, error: readError } = await supabaseAdmin
    .from("supplier_storefronts")
    .select("*")
    .eq("supplier_account_id", account.id)
    .maybeSingle();
  if (readError) throw readError;

  let storefront = existing;
  if (!storefront) {
    const name = account.business_name || account.display_name || "Supplier Store";
    const slug = await uniqueStorefrontSlug(name);
    const { data, error } = await supabaseAdmin
      .from("supplier_storefronts")
      .insert({
        supplier_account_id: account.id,
        slug,
        name,
        currency_code: "THB",
      })
      .select("*")
      .single();
    if (error) throw error;
    storefront = data;
  }

  const relationshipScope = await supplierRelationshipScope(identity, account);
  await syncSupplierStorefrontRelationships(
    { ...identity, access: relationshipScope.scopedAccess },
    storefront.id,
  );
  return { account, storefront };
}

export async function syncSupplierStorefrontRelationships(identity, storefrontId) {
  for (const access of identity.access) {
    const { error } = await supabaseAdmin
      .from("supplier_storefront_relationships")
      .upsert({
        storefront_id: storefrontId,
        supplier_portal_access_id: access.id,
        organization_id: access.organization_id,
        supplier_profile_id: access.supplier_profile_id,
        supplier_party_id: access.supplier_party_id,
        status: "ACTIVE",
        customer_visible: true,
        order_enabled: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "supplier_portal_access_id" });
    if (error) throw error;
  }
}
export async function supplierStorefrontSnapshot() {
  const identity = await requireSupplierPortalIdentity();
  if (!identity.success) return identity;
  const resolved = await resolveSupplierAccount(identity);
  const account = resolved.account;

  const storefrontResult = account
    ? await supabaseAdmin
        .from("supplier_storefronts")
        .select("*")
        .eq("supplier_account_id", account.id)
        .maybeSingle()
    : { data: null, error: null };
  if (storefrontResult.error) throw storefrontResult.error;
  const storefront = storefrontResult.data || null;
  const relationshipScope = await supplierRelationshipScope(identity, account);

  const productsResult = storefront
    ? await supabaseAdmin
        .from("supplier_storefront_products")
        .select("*")
        .eq("storefront_id", storefront.id)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
    : { data: [], error: null };
  if (productsResult.error) throw productsResult.error;

  const visibleAccess = account ? relationshipScope.scopedAccess : identity.access;
  const accessForOrganizationLookup = account
    ? [...relationshipScope.scopedAccess, ...relationshipScope.unassignedAccess]
    : identity.access;
  const organizationIds = [...new Set(accessForOrganizationLookup.map((row) => row.organization_id).filter(Boolean))];
  const { data: organizations, error: organizationError } = organizationIds.length
    ? await supabaseAdmin.from("organizations").select("id,name,legal_name").in("id", organizationIds)
    : { data: [], error: null };
  if (organizationError) throw organizationError;
  const orgById = new Map((organizations || []).map((row) => [String(row.id), row]));

  let relationships = visibleAccess.map((row) => ({
    id: row.id,
    supplier_portal_access_id: row.id,
    organization_id: row.organization_id,
    supplier_profile_id: row.supplier_profile_id,
    supplier_party_id: row.supplier_party_id,
    status: row.status,
    customer_visible: Boolean(storefront),
    order_enabled: Boolean(storefront),
    pricing_mode: "BASE_PRICE",
    organization: orgById.get(String(row.organization_id)) || null,
  }));

  if (storefront) {
    const { data: relationshipRows, error: relationshipsError } = await supabaseAdmin
      .from("supplier_storefront_relationships")
      .select("id,supplier_portal_access_id,organization_id,supplier_profile_id,supplier_party_id,status,customer_visible,order_enabled,pricing_mode")
      .eq("storefront_id", storefront.id)
      .neq("status", "REVOKED");
    if (relationshipsError) throw relationshipsError;
    relationships = (relationshipRows || []).map((row) => ({
      ...row,
      organization: orgById.get(String(row.organization_id)) || null,
    }));
  }

  return {
    success: true,
    account: account || null,
    network_profiles: resolved.memberships || [],
    storefront: storefront || null,
    products: productsResult.data || [],
    relationships,
    unassigned_relationships: account
      ? relationshipScope.unassignedAccess.map((row) => ({
          ...row,
          organization: orgById.get(String(row.organization_id)) || null,
        }))
      : [],
    capabilities: {
      invited_relationships: identity.access.length > 0,
      storefront: Boolean(storefront),
      discoverable: account?.shop_discoverable === true,
      business: Boolean(account?.business_organization_id),
    },
  };
}
export async function updateSupplierStorefront(patch = {}) {
  const identity = await requireSupplierPortalIdentity();
  if (!identity.success) return identity;
  const resolved = await resolveSupplierAccount(identity);
  if (!resolved.account || !canManageSupplierAccount(resolved)) {
    return { success: false, status: 403, error: "Supplier owner or admin authority required" };
  }
  const { storefront } = await ensureSupplierStorefront(identity);
  const allowed = {
    name: text(patch.name) || storefront.name,
    headline: text(patch.headline) || null,
    description: text(patch.description) || null,
    currency_code: text(patch.currency_code || patch.currencyCode).toUpperCase() || storefront.currency_code,
    allow_public_browse: patch.allow_public_browse === true,
    allow_customer_orders: patch.allow_customer_orders !== false,
    updated_at: new Date().toISOString(),
  };
  if (["DRAFT","PUBLISHED","PAUSED"].includes(text(patch.status).toUpperCase())) {
    allowed.status = text(patch.status).toUpperCase();
    if (allowed.status === "PUBLISHED" && !storefront.published_at) allowed.published_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from("supplier_storefronts")
    .update(allowed)
    .eq("id", storefront.id)
    .eq("supplier_account_id", storefront.supplier_account_id)
    .select("*")
    .single();
  if (error) throw error;
  return { success: true, storefront: data };
}

export async function createSupplierStorefrontProduct(input = {}) {
  const identity = await requireSupplierPortalIdentity();
  if (!identity.success) return identity;
  const resolved = await resolveSupplierAccount(identity);
  if (!resolved.account || !canManageSupplierAccount(resolved)) {
    return { success: false, status: 403, error: "Supplier owner or admin authority required" };
  }
  const { storefront } = await ensureSupplierStorefront(identity);
  const name = text(input.name);
  if (!name) return { success: false, status: 400, error: "Product name required" };

  const price = Number(input.base_price ?? input.basePrice ?? 0);
  const minimum = Number(input.minimum_order_quantity ?? input.minimumOrderQuantity ?? 1);
  if (!Number.isFinite(price) || price < 0) return { success: false, status: 400, error: "Valid base price required" };
  if (!Number.isFinite(minimum) || minimum <= 0) return { success: false, status: 400, error: "Minimum order quantity must be positive" };

  const { data, error } = await supabaseAdmin
    .from("supplier_storefront_products")
    .insert({
      storefront_id: storefront.id,
      sku: text(input.sku) || null,
      name,
      description: text(input.description) || null,
      category: text(input.category) || null,
      uom: text(input.uom) || null,
      base_price: price,
      currency_code: text(input.currency_code || input.currencyCode).toUpperCase() || storefront.currency_code,
      minimum_order_quantity: minimum,
      lead_time_days: Math.max(0, Number.parseInt(input.lead_time_days ?? input.leadTimeDays ?? 0, 10) || 0),
      image_url: text(input.image_url ?? input.imageUrl) || null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return { success: true, product: data };
}
export async function supplierOperationalSnapshot() {
  const identity = await requireSupplierPortalIdentity();
  if (!identity.success) return identity;
  const resolved = await resolveSupplierAccount(identity);
  const scope = await supplierRelationshipScope(identity, resolved.account);
  const operationalAccess = resolved.account ? scope.scopedAccess : identity.access;

  const orders = [];
  const invoices = [];
  const payments = [];
  const customerIds = [...new Set(operationalAccess.map((row) => row.organization_id).filter(Boolean))];
  const { data: organizations, error: organizationError } = customerIds.length
    ? await supabaseAdmin.from("organizations").select("id,name,legal_name").in("id", customerIds)
    : { data: [], error: null };
  if (organizationError) throw organizationError;
  const orgById = new Map((organizations || []).map((row) => [String(row.id), row]));

  for (const access of operationalAccess) {
    const [orderResult, invoiceResult, paymentResult, responseResult] = await Promise.all([
      supabaseAdmin
        .from("purchase_orders")
        .select("id,po_number,status,total_amount,currency,expected_delivery_date,notes,created_at,updated_at,organization_id,entity_id")
        .eq("organization_id", access.organization_id)
        .eq("supplier_party_id", access.supplier_party_id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("vendor_invoices")
        .select("id,invoice_number,invoice_date,due_date,total_amount,outstanding_amount,currency_code,status,document_id,paid_at,created_at,organization_id,entity_id")
        .eq("organization_id", access.organization_id)
        .eq("vendor_party_id", access.supplier_party_id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("vendor_payments")
        .select("id,amount,payment_method,paid_at,currency_code,reference_number,status,created_at,organization_id,entity_id")
        .eq("organization_id", access.organization_id)
        .eq("vendor_party_id", access.supplier_party_id)
        .order("paid_at", { ascending: false })
        .limit(100),
      resolved.account
        ? supabaseAdmin
            .from("supplier_purchase_order_responses")
            .select("id,purchase_order_id,response_status,supplier_note,promised_delivery_date,dispatched_at,dispatch_reference,acknowledged_at,declined_at,updated_at")
            .eq("supplier_account_id", resolved.account.id)
            .eq("supplier_portal_access_id", access.id)
            .eq("organization_id", access.organization_id)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (orderResult.error) throw orderResult.error;
    if (invoiceResult.error) throw invoiceResult.error;
    if (paymentResult.error) throw paymentResult.error;
    if (responseResult.error) throw responseResult.error;

    const customer = orgById.get(String(access.organization_id)) || null;
    const responseByOrderId = new Map((responseResult.data || []).map((row) => [String(row.purchase_order_id), row]));
    orders.push(...(orderResult.data || []).map((row) => ({
      ...row,
      customer,
      supplier_response: responseByOrderId.get(String(row.id)) || null,
    })));
    invoices.push(...(invoiceResult.data || []).map((row) => ({ ...row, customer })));
    payments.push(...(paymentResult.data || []).map((row) => ({ ...row, customer })));
  }

  return {
    success: true,
    orders: orders.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)),
    invoices: invoices.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)),
    payments: payments.sort((a, b) => new Date(b.paid_at || b.created_at || 0) - new Date(a.paid_at || a.created_at || 0)),
  };
}

const SUPPLIER_BUSINESS_OWNER_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);

export async function enableSupplierStorefront() {
  const identity = await requireSupplierPortalIdentity();
  if (!identity.success) return identity;
  const resolvedBeforeCreate = await resolveSupplierAccount(identity);
  if (resolvedBeforeCreate.account && !canManageSupplierAccount(resolvedBeforeCreate)) {
    return { success: false, status: 403, error: "Supplier owner or admin authority required" };
  }
  const { account, storefront } = await ensureSupplierStorefront(identity);
  const { data: updatedAccount, error } = await supabaseAdmin
    .from("supplier_portal_accounts")
    .update({ storefront_enabled: true, updated_at: new Date().toISOString() })
    .eq("id", account.id)
    .select("*")
    .single();
  if (error) throw error;
  return { success: true, account: updatedAccount, storefront };
}

export async function updateSupplierNetworkProfile(input = {}) {
  const identity = await requireSupplierPortalIdentity();
  if (!identity.success) return identity;
  const resolved = await resolveSupplierAccount(identity);
  if (resolved.account && !canManageSupplierAccount(resolved)) {
    return { success: false, status: 403, error: "Supplier owner or admin authority required" };
  }
  const account = await ensureSupplierAccount(identity);
  const patch = {
    updated_at: new Date().toISOString(),
  };
  if (Object.prototype.hasOwnProperty.call(input, "display_name") || Object.prototype.hasOwnProperty.call(input, "displayName")) {
    patch.display_name = text(input.display_name ?? input.displayName) || null;
  }
  if (Object.prototype.hasOwnProperty.call(input, "business_name") || Object.prototype.hasOwnProperty.call(input, "businessName")) {
    patch.business_name = text(input.business_name ?? input.businessName) || null;
  }
  if (Object.prototype.hasOwnProperty.call(input, "phone")) {
    patch.phone = text(input.phone) || null;
  }
  if (Object.prototype.hasOwnProperty.call(input, "website")) {
    patch.website = text(input.website) || null;
  }
  if (Object.prototype.hasOwnProperty.call(input, "logo_url") || Object.prototype.hasOwnProperty.call(input, "logoUrl")) {
    patch.logo_url = text(input.logo_url ?? input.logoUrl) || null;
  }
  if (Object.prototype.hasOwnProperty.call(input, "supplier_categories") || Object.prototype.hasOwnProperty.call(input, "supplierCategories")) {
    patch.supplier_categories = discoveryTags(input.supplier_categories ?? input.supplierCategories);
  }
  if (Object.prototype.hasOwnProperty.call(input, "service_areas") || Object.prototype.hasOwnProperty.call(input, "serviceAreas")) {
    patch.service_areas = discoveryTags(input.service_areas ?? input.serviceAreas);
  }
  if (typeof input.shop_discoverable === "boolean") {
    if (input.shop_discoverable === true) {
      const { data: storefront, error: storefrontError } = await supabaseAdmin
        .from("supplier_storefronts")
        .select("id,status")
        .eq("supplier_account_id", account.id)
        .maybeSingle();
      if (storefrontError) throw storefrontError;
      if (!storefront || storefront.status !== "PUBLISHED") {
        return { success: false, status: 409, error: "Publish the supplier shop before enabling network discovery" };
      }
    }
    patch.shop_discoverable = input.shop_discoverable;
  }
  const { data, error } = await supabaseAdmin
    .from("supplier_portal_accounts")
    .update(patch)
    .eq("id", account.id)
    .select("*")
    .single();
  if (error) throw error;
  return { success: true, account: data };
}

export async function supplierBusinessCandidates() {
  const identity = await requireSupplierPortalIdentity();
  if (!identity.success) return identity;

  const { data: staffRows, error: staffError } = await supabaseAdmin
    .from("staff_accounts")
    .select("id,role,active")
    .eq("auth_user_id", identity.user.id)
    .eq("active", true);
  if (staffError) throw staffError;
  const staffIds = (staffRows || []).map((row) => row.id);
  if (!staffIds.length) return { success: true, organizations: [] };

  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from("organization_users")
    .select("organization_id,staff_account_id,role,status")
    .in("staff_account_id", staffIds)
    .eq("status", "ACTIVE");
  if (membershipError) throw membershipError;

  const ownedMemberships = (memberships || []).filter((row) =>
    SUPPLIER_BUSINESS_OWNER_ROLES.has(String(row.role || "").trim().toUpperCase())
  );
  const organizationIds = [...new Set(ownedMemberships.map((row) => row.organization_id).filter(Boolean))];
  if (!organizationIds.length) return { success: true, organizations: [] };

  const { data: organizations, error: organizationError } = await supabaseAdmin
    .from("organizations")
    .select("id,name,legal_name,status,organization_status")
    .in("id", organizationIds);
  if (organizationError) throw organizationError;

  return {
    success: true,
    organizations: (organizations || []).map((organization) => ({
      ...organization,
      role: ownedMemberships.find((row) => String(row.organization_id) === String(organization.id))?.role || "OWNER",
    })),
  };
}

export async function linkSupplierBusiness({ organizationId }) {
  const identity = await requireSupplierPortalIdentity();
  if (!identity.success) return identity;
  const targetId = text(organizationId);
  if (!targetId) return { success: false, status: 400, error: "organizationId required" };

  const candidates = await supplierBusinessCandidates();
  if (!candidates.success) return candidates;
  if (!(candidates.organizations || []).some((organization) => String(organization.id) === targetId)) {
    return { success: false, status: 403, error: "Owner access to this Avantiqo Business is required" };
  }

  const resolved = await resolveSupplierAccount(identity);
  if (!resolved.account || !canManageSupplierAccount(resolved)) {
    return { success: false, status: 403, error: "Supplier owner or admin authority required" };
  }
  const account = resolved.account;
  const { data, error } = await supabaseAdmin
    .from("supplier_portal_accounts")
    .update({
      business_organization_id: targetId,
      business_linked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.id)
    .select("*")
    .single();
  if (error) throw error;
  const catalogSync = await autoMapSupplierBusinessCatalog({ identity });
  return { success: true, account: data, catalog_sync: catalogSync?.success ? catalogSync : null };
}

export async function supplierConnectionRequests() {
  const identity = await requireSupplierPortalIdentity();
  if (!identity.success) return identity;
  const resolved = await resolveSupplierAccount(identity);
  const account = resolved.account;
  if (!account) return { success: true, requests: [] };

  const { data: requests, error } = await supabaseAdmin
    .from("supplier_network_connection_requests")
    .select("id,organization_id,status,buyer_note,supplier_note,responded_at,created_at,updated_at")
    .eq("supplier_account_id", account.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const organizationIds = [...new Set((requests || []).map((row) => row.organization_id).filter(Boolean))];
  const { data: organizations, error: organizationError } = organizationIds.length
    ? await supabaseAdmin.from("organizations").select("id,name,legal_name").in("id", organizationIds)
    : { data: [], error: null };
  if (organizationError) throw organizationError;
  const organizationById = new Map((organizations || []).map((row) => [String(row.id), row]));

  return {
    success: true,
    requests: (requests || []).map((row) => ({
      ...row,
      organization: organizationById.get(String(row.organization_id)) || null,
    })),
  };
}

async function notifyBuyerOfSupplierConnectionResponse({ requestRow, account, status, supplierNote = "" }) {
  const requesterId = requestRow?.requested_by_auth_user_id;
  if (!requesterId) {
    return { sent: false, status: "SKIPPED", reason: "BUYER_REQUESTER_MISSING" };
  }

  try {
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.getUserById(requesterId);
    if (authError) throw authError;
    const email = authData?.user?.email || null;
    if (!email) {
      return { sent: false, status: "SKIPPED", reason: "BUYER_EMAIL_MISSING" };
    }

    return await deliverSupplierConnectionResponseEmail({
      organizationId: requestRow.organization_id,
      recipient: email,
      supplierName: account?.business_name || account?.display_name || account?.email || "The supplier",
      action: status,
      supplierNote,
    });
  } catch (error) {
    return {
      sent: false,
      status: "DELIVERY_FAILED",
      reason: String(error?.message || error || "SUPPLIER_CONNECTION_RESPONSE_NOTIFICATION_FAILED").slice(0, 500),
    };
  }
}

export async function respondToSupplierConnection({ requestId, action, supplierNote = "" }) {
  const identity = await requireSupplierPortalIdentity();
  if (!identity.success) return identity;
  const resolved = await resolveSupplierAccount(identity);
  const account = resolved.account;
  if (!account) return { success: false, status: 404, error: "Supplier Network profile required" };
  if (!canManageSupplierAccount(resolved)) {
    return { success: false, status: 403, error: "Supplier owner or admin authority required" };
  }
  const normalizedAction = text(action).toUpperCase();
  if (!["ACCEPT","DECLINE"].includes(normalizedAction)) {
    return { success: false, status: 400, error: "action must be ACCEPT or DECLINE" };
  }

  const { data: requestRow, error: requestError } = await supabaseAdmin
    .from("supplier_network_connection_requests")
    .select("*")
    .eq("id", text(requestId))
    .eq("supplier_account_id", account.id)
    .maybeSingle();
  if (requestError) throw requestError;
  if (!requestRow) return { success: false, status: 404, error: "Supplier connection request not found" };

  if (normalizedAction === "DECLINE") {
    const { data, error } = await supabaseAdmin
      .from("supplier_network_connection_requests")
      .update({
        status: "DECLINED",
        supplier_note: text(supplierNote).slice(0, 1200) || null,
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestRow.id)
      .eq("supplier_account_id", account.id)
      .select("*")
      .single();
    if (error) throw error;
    const notification = await notifyBuyerOfSupplierConnectionResponse({
      requestRow,
      account,
      status: "DECLINED",
      supplierNote,
    });
    return { success: true, request: data, notification };
  }

  const { data: existingLink, error: existingLinkError } = await supabaseAdmin
    .from("supplier_network_customer_links")
    .select("*")
    .eq("organization_id", requestRow.organization_id)
    .eq("supplier_account_id", account.id)
    .maybeSingle();
  if (existingLinkError) throw existingLinkError;
  if (existingLink) {
    await supabaseAdmin
      .from("supplier_network_connection_requests")
      .update({ status: "ACCEPTED", responded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", requestRow.id);
    const notification = await notifyBuyerOfSupplierConnectionResponse({
      requestRow,
      account,
      status: "ACCEPTED",
      supplierNote,
    });
    return { success: true, connected: true, link: existingLink, notification };
  }

  let party = null;
  if (account.email) {
    const { data: partyRows, error: partyLookupError } = await supabaseAdmin
      .from("parties")
      .select("id,organization_id,display_name,legal_name,email,phone")
      .eq("organization_id", requestRow.organization_id)
      .eq("email", account.email)
      .limit(1);
    if (partyLookupError) throw partyLookupError;
    party = (partyRows || [])[0] || null;
  }

  if (!party) {
    const { data, error } = await supabaseAdmin
      .from("parties")
      .insert({
        organization_id: requestRow.organization_id,
        party_type: "company",
        display_name: account.business_name || account.display_name || account.email || "Supplier",
        legal_name: account.business_name || null,
        email: account.email || null,
        phone: account.phone || null,
        status: "active",
      })
      .select("id,organization_id,display_name,legal_name,email,phone")
      .single();
    if (error) throw error;
    party = data;
  }

  let supplierProfile = null;
  const { data: profileRows, error: profileLookupError } = await supabaseAdmin
    .from("supplier_profiles")
    .select("*")
    .eq("organization_id", requestRow.organization_id)
    .eq("party_id", party.id)
    .limit(1);
  if (profileLookupError) throw profileLookupError;
  supplierProfile = (profileRows || [])[0] || null;

  if (!supplierProfile) {
    const { data, error } = await supabaseAdmin
      .from("supplier_profiles")
      .insert({
        organization_id: requestRow.organization_id,
        party_id: party.id,
        is_active: true,
        is_blocked: false,
        notes: "Connected through Avantiqo Supplier Network",
      })
      .select("*")
      .single();
    if (error) throw error;
    supplierProfile = data;
  }

  const { data: portalAccess, error: accessError } = await supabaseAdmin
    .from("supplier_portal_access")
    .upsert({
      organization_id: requestRow.organization_id,
      supplier_profile_id: supplierProfile.id,
      supplier_party_id: party.id,
      auth_user_id: identity.user.id,
      email: account.email,
      status: "ACTIVE",
      updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id,supplier_profile_id,auth_user_id" })
    .select("*")
    .single();
  if (accessError) throw accessError;

  const { error: accountRelationshipError } = await supabaseAdmin
    .from("supplier_portal_account_relationships")
    .upsert({
      supplier_account_id: account.id,
      supplier_portal_access_id: portalAccess.id,
      attached_by_auth_user_id: identity.user.id,
    }, { onConflict: "supplier_portal_access_id" });
  if (accountRelationshipError) throw accountRelationshipError;

  const { data: link, error: linkError } = await supabaseAdmin
    .from("supplier_network_customer_links")
    .upsert({
      organization_id: requestRow.organization_id,
      supplier_account_id: account.id,
      supplier_party_id: party.id,
      supplier_profile_id: supplierProfile.id,
      supplier_portal_access_id: portalAccess.id,
      connection_request_id: requestRow.id,
    }, { onConflict: "organization_id,supplier_account_id" })
    .select("*")
    .single();
  if (linkError) throw linkError;

  const { error: finalizeError } = await supabaseAdmin
    .from("supplier_network_connection_requests")
    .update({
      status: "ACCEPTED",
      supplier_note: text(supplierNote).slice(0, 1200) || null,
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestRow.id)
    .eq("supplier_account_id", account.id);
  if (finalizeError) throw finalizeError;

  const { data: storefrontForAccount, error: storefrontError } = await supabaseAdmin
    .from("supplier_storefronts")
    .select("id")
    .eq("supplier_account_id", account.id)
    .maybeSingle();
  if (storefrontError) throw storefrontError;
  if (storefrontForAccount) {
    await syncSupplierStorefrontRelationships(
      { ...identity, access: [...identity.access, portalAccess] },
      storefrontForAccount.id,
    );
  }

  const notification = await notifyBuyerOfSupplierConnectionResponse({
    requestRow,
    account,
    status: "ACCEPTED",
    supplierNote,
  });

  return { success: true, connected: true, link, supplier_profile: supplierProfile, notification };
}

export async function setDefaultSupplierAccount({ supplierAccountId }) {
  const identity = await requireSupplierPortalIdentity();
  if (!identity.success) return identity;
  const targetId = text(supplierAccountId);
  if (!targetId) return { success: false, status: 400, error: "supplierAccountId required" };

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("supplier_portal_account_members")
    .select("id,supplier_account_id,auth_user_id,role,status,is_default")
    .eq("supplier_account_id", targetId)
    .eq("auth_user_id", identity.user.id)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) return { success: false, status: 403, error: "Active supplier profile membership required" };

  const { error: clearError } = await supabaseAdmin
    .from("supplier_portal_account_members")
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq("auth_user_id", identity.user.id)
    .eq("status", "ACTIVE");
  if (clearError) throw clearError;

  const { data, error } = await supabaseAdmin
    .from("supplier_portal_account_members")
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq("id", membership.id)
    .eq("auth_user_id", identity.user.id)
    .select("id,supplier_account_id,role,status,is_default")
    .single();
  if (error) throw error;
  return { success: true, membership: data };
}

export async function attachSupplierRelationship({ supplierPortalAccessId }) {
  const identity = await requireSupplierPortalIdentity();
  if (!identity.success) return identity;
  const resolved = await resolveSupplierAccount(identity);
  if (!resolved.account || !canManageSupplierAccount(resolved)) {
    return { success: false, status: 403, error: "Supplier owner or admin authority required" };
  }

  const accessId = text(supplierPortalAccessId);
  const access = (identity.access || []).find((row) => String(row.id) === accessId);
  if (!access) return { success: false, status: 404, error: "Supplier relationship not available to this login" };

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("supplier_portal_account_relationships")
    .select("supplier_account_id,supplier_portal_access_id")
    .eq("supplier_portal_access_id", accessId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing && String(existing.supplier_account_id) !== String(resolved.account.id)) {
    return { success: false, status: 409, error: "Supplier relationship is already attached to another supplier profile" };
  }

  const { data, error } = await supabaseAdmin
    .from("supplier_portal_account_relationships")
    .upsert({
      supplier_account_id: resolved.account.id,
      supplier_portal_access_id: accessId,
      attached_by_auth_user_id: identity.user.id,
    }, { onConflict: "supplier_portal_access_id" })
    .select("*")
    .single();
  if (error) throw error;

  const { data: storefront, error: storefrontError } = await supabaseAdmin
    .from("supplier_storefronts")
    .select("id")
    .eq("supplier_account_id", resolved.account.id)
    .maybeSingle();
  if (storefrontError) throw storefrontError;
  if (storefront) {
    await syncSupplierStorefrontRelationships({ ...identity, access: [access] }, storefront.id);
  }

  return { success: true, relationship: data };
}

export async function updateSupplierStorefrontProduct(input = {}) {
  const identity = await requireSupplierPortalIdentity();
  if (!identity.success) return identity;
  const resolved = await resolveSupplierAccount(identity);
  if (!resolved.account || !canManageSupplierAccount(resolved)) {
    return { success: false, status: 403, error: "Supplier owner or admin authority required" };
  }

  const productId = text(input.productId ?? input.id);
  if (!productId) return { success: false, status: 400, error: "productId required" };

  const { data: storefront, error: storefrontError } = await supabaseAdmin
    .from("supplier_storefronts")
    .select("id,currency_code")
    .eq("supplier_account_id", resolved.account.id)
    .maybeSingle();
  if (storefrontError) throw storefrontError;
  if (!storefront) return { success: false, status: 404, error: "Supplier storefront not found" };

  const patch = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) {
    const name = text(input.name);
    if (!name) return { success: false, status: 400, error: "Product name required" };
    patch.name = name;
  }
  if (input.sku !== undefined) patch.sku = text(input.sku) || null;
  if (input.description !== undefined) patch.description = text(input.description) || null;
  if (input.category !== undefined) patch.category = text(input.category) || null;
  if (input.uom !== undefined) patch.uom = text(input.uom) || null;
  if (input.basePrice !== undefined || input.base_price !== undefined) {
    const price = Number(input.base_price ?? input.basePrice);
    if (!Number.isFinite(price) || price < 0) return { success: false, status: 400, error: "Valid base price required" };
    patch.base_price = price;
  }
  if (input.currencyCode !== undefined || input.currency_code !== undefined) {
    patch.currency_code = text(input.currency_code ?? input.currencyCode).toUpperCase() || storefront.currency_code;
  }
  if (input.minimumOrderQuantity !== undefined || input.minimum_order_quantity !== undefined) {
    const minimum = Number(input.minimum_order_quantity ?? input.minimumOrderQuantity);
    if (!Number.isFinite(minimum) || minimum <= 0) return { success: false, status: 400, error: "Minimum order quantity must be positive" };
    patch.minimum_order_quantity = minimum;
  }
  if (input.leadTimeDays !== undefined || input.lead_time_days !== undefined) {
    patch.lead_time_days = Math.max(0, Number.parseInt(input.lead_time_days ?? input.leadTimeDays, 10) || 0);
  }
  if (input.imageUrl !== undefined || input.image_url !== undefined) {
    patch.image_url = text(input.image_url ?? input.imageUrl) || null;
  }
  if (typeof input.isActive === "boolean") patch.is_active = input.isActive;
  if (typeof input.is_active === "boolean") patch.is_active = input.is_active;

  const { data, error } = await supabaseAdmin
    .from("supplier_storefront_products")
    .update(patch)
    .eq("id", productId)
    .eq("storefront_id", storefront.id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { success: false, status: 404, error: "Supplier product not found" };
  return { success: true, product: data };
}

function normalizedSku(value) {
  return text(value).toUpperCase();
}

async function supplierLinkedBusinessContext(identity) {
  const resolved = await resolveSupplierAccount(identity);
  if (!resolved.account || !canManageSupplierAccount(resolved)) {
    return { success: false, status: 403, error: "Supplier owner or admin authority required" };
  }
  const organizationId = text(resolved.account.business_organization_id);
  if (!organizationId) {
    return { success: false, status: 409, error: "Connect an Avantiqo Business before linking the supplier catalog" };
  }
  const { data: storefront, error: storefrontError } = await supabaseAdmin
    .from("supplier_storefronts")
    .select("id,supplier_account_id")
    .eq("supplier_account_id", resolved.account.id)
    .maybeSingle();
  if (storefrontError) throw storefrontError;
  if (!storefront) {
    return { success: false, status: 404, error: "Supplier storefront not found" };
  }
  return { success: true, resolved, account: resolved.account, organizationId, storefront };
}

async function syncMappedSupplierProducts({ storefrontId, organizationId }) {
  const { data: mapped, error: mappedError } = await supabaseAdmin
    .from("supplier_storefront_products")
    .select("id,business_inventory_item_id")
    .eq("storefront_id", storefrontId)
    .eq("business_sync_enabled", true)
    .not("business_inventory_item_id", "is", null);
  if (mappedError) throw mappedError;
  if (!(mapped || []).length) return { synced: 0 };

  const itemIds = [...new Set(mapped.map((row) => row.business_inventory_item_id).filter(Boolean))];
  const { data: items, error: itemError } = await supabaseAdmin
    .from("inventory_items")
    .select("id,organization_id,name,code,sale_price,is_active")
    .eq("organization_id", organizationId)
    .in("id", itemIds);
  if (itemError) throw itemError;
  const itemById = new Map((items || []).map((row) => [String(row.id), row]));

  let synced = 0;
  for (const product of mapped || []) {
    const item = itemById.get(String(product.business_inventory_item_id));
    if (!item) continue;
    const patch = {
      name: item.name,
      sku: item.code || null,
      is_active: item.is_active !== false,
      last_business_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (item.sale_price !== null && item.sale_price !== undefined) patch.base_price = Number(item.sale_price);
    const { error } = await supabaseAdmin
      .from("supplier_storefront_products")
      .update(patch)
      .eq("id", product.id)
      .eq("storefront_id", storefrontId)
      .eq("business_inventory_item_id", item.id);
    if (error) throw error;
    synced += 1;
  }
  return { synced };
}

export async function autoMapSupplierBusinessCatalog({ identity: suppliedIdentity } = {}) {
  const identity = suppliedIdentity || await requireSupplierPortalIdentity();
  if (!identity.success) return identity;
  const context = await supplierLinkedBusinessContext(identity);
  if (!context.success) return context;

  const { data: products, error: productError } = await supabaseAdmin
    .from("supplier_storefront_products")
    .select("id,sku,business_inventory_item_id")
    .eq("storefront_id", context.storefront.id)
    .is("business_inventory_item_id", null);
  if (productError) throw productError;

  const skuSet = [...new Set((products || []).map((row) => normalizedSku(row.sku)).filter(Boolean))];
  if (!skuSet.length) {
    const synced = await syncMappedSupplierProducts({ storefrontId: context.storefront.id, organizationId: context.organizationId });
    return { success: true, mapped: 0, ambiguous: 0, unmatched: (products || []).length, ...synced };
  }

  const { data: items, error: itemError } = await supabaseAdmin
    .from("inventory_items")
    .select("id,organization_id,name,code,sale_price,is_active")
    .eq("organization_id", context.organizationId)
    .eq("is_active", true);
  if (itemError) throw itemError;

  const itemsBySku = new Map();
  for (const item of items || []) {
    const sku = normalizedSku(item.code);
    if (!sku || !skuSet.includes(sku)) continue;
    const list = itemsBySku.get(sku) || [];
    list.push(item);
    itemsBySku.set(sku, list);
  }

  let mapped = 0;
  let ambiguous = 0;
  let unmatched = 0;
  for (const product of products || []) {
    const sku = normalizedSku(product.sku);
    const matches = sku ? (itemsBySku.get(sku) || []) : [];
    if (matches.length === 1) {
      const item = matches[0];
      const patch = {
        business_inventory_item_id: item.id,
        business_sync_enabled: true,
        name: item.name,
        sku: item.code || product.sku || null,
        is_active: item.is_active !== false,
        last_business_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (item.sale_price !== null && item.sale_price !== undefined) patch.base_price = Number(item.sale_price);
      const { error } = await supabaseAdmin
        .from("supplier_storefront_products")
        .update(patch)
        .eq("id", product.id)
        .eq("storefront_id", context.storefront.id)
        .is("business_inventory_item_id", null);
      if (error) throw error;
      mapped += 1;
    } else if (matches.length > 1) {
      ambiguous += 1;
    } else {
      unmatched += 1;
    }
  }

  const synced = await syncMappedSupplierProducts({ storefrontId: context.storefront.id, organizationId: context.organizationId });
  return { success: true, mapped, ambiguous, unmatched, ...synced };
}

export async function supplierBusinessCatalogCandidates() {
  const identity = await requireSupplierPortalIdentity();
  if (!identity.success) return identity;
  const context = await supplierLinkedBusinessContext(identity);
  if (!context.success) return context;

  const [{ data: products, error: productError }, { data: items, error: itemError }] = await Promise.all([
    supabaseAdmin
      .from("supplier_storefront_products")
      .select("id,sku,name,base_price,is_active,business_inventory_item_id,business_sync_enabled,last_business_sync_at")
      .eq("storefront_id", context.storefront.id)
      .order("name", { ascending: true }),
    supabaseAdmin
      .from("inventory_items")
      .select("id,entity_id,name,code,sale_price,is_active")
      .eq("organization_id", context.organizationId)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(1000),
  ]);
  if (productError) throw productError;
  if (itemError) throw itemError;
  return { success: true, products: products || [], business_items: items || [] };
}

export async function mapSupplierProductToBusinessItem({ productId, inventoryItemId, syncEnabled = true }) {
  const identity = await requireSupplierPortalIdentity();
  if (!identity.success) return identity;
  const context = await supplierLinkedBusinessContext(identity);
  if (!context.success) return context;

  const shopProductId = text(productId);
  const itemId = text(inventoryItemId);
  if (!shopProductId || !itemId) return { success: false, status: 400, error: "productId and inventoryItemId are required" };

  const { data: item, error: itemError } = await supabaseAdmin
    .from("inventory_items")
    .select("id,organization_id,name,code,sale_price,is_active")
    .eq("id", itemId)
    .eq("organization_id", context.organizationId)
    .maybeSingle();
  if (itemError) throw itemError;
  if (!item) return { success: false, status: 404, error: "Business catalog item not found in the linked organization" };

  const patch = {
    business_inventory_item_id: item.id,
    business_sync_enabled: syncEnabled !== false,
    last_business_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (syncEnabled !== false) {
    patch.name = item.name;
    patch.sku = item.code || null;
    patch.is_active = item.is_active !== false;
    if (item.sale_price !== null && item.sale_price !== undefined) patch.base_price = Number(item.sale_price);
  }

  const { data, error } = await supabaseAdmin
    .from("supplier_storefront_products")
    .update(patch)
    .eq("id", shopProductId)
    .eq("storefront_id", context.storefront.id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { success: false, status: 404, error: "Supplier shop product not found" };
  return { success: true, product: data };
}

export async function syncSupplierBusinessCatalog() {
  const identity = await requireSupplierPortalIdentity();
  if (!identity.success) return identity;
  const context = await supplierLinkedBusinessContext(identity);
  if (!context.success) return context;
  const result = await syncMappedSupplierProducts({ storefrontId: context.storefront.id, organizationId: context.organizationId });
  return { success: true, ...result };
}

export async function createSupplierNetworkProfile(input = {}) {
  const identity = await requireSupplierPortalIdentity();
  if (!identity.success) return identity;

  const businessName = text(input.business_name ?? input.businessName);
  if (!businessName) {
    return { success: false, status: 400, error: "Business name is required" };
  }

  const email = text(identity.user?.email || identity.access?.[0]?.email).toLowerCase();
  if (!email) {
    return { success: false, status: 400, error: "Supplier profile requires an email address" };
  }

  const makeDefault = input.makeDefault !== false;
  let previousDefaultIds = [];
  if (makeDefault) {
    const { data: previousDefaults, error: previousDefaultsError } = await supabaseAdmin
      .from("supplier_portal_account_members")
      .select("id")
      .eq("auth_user_id", identity.user.id)
      .eq("status", "ACTIVE")
      .eq("is_default", true);
    if (previousDefaultsError) throw previousDefaultsError;
    previousDefaultIds = (previousDefaults || []).map((row) => row.id).filter(Boolean);
  }

  const { data: account, error: accountError } = await supabaseAdmin
    .from("supplier_portal_accounts")
    .insert({
      email,
      business_name: businessName,
      display_name: text(input.display_name ?? input.displayName) || businessName,
      phone: text(input.phone) || null,
      website: text(input.website) || null,
    })
    .select("*")
    .single();
  if (accountError) throw accountError;

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("supplier_portal_account_members")
    .insert({
      supplier_account_id: account.id,
      auth_user_id: identity.user.id,
      role: "OWNER",
      status: "ACTIVE",
      is_default: false,
    })
    .select("id,supplier_account_id,auth_user_id,role,status,is_default")
    .single();

  if (membershipError) {
    await supabaseAdmin.from("supplier_portal_accounts").delete().eq("id", account.id);
    throw membershipError;
  }

  let finalMembership = membership;
  if (makeDefault) {
    const { error: clearDefaultError } = await supabaseAdmin
      .from("supplier_portal_account_members")
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("auth_user_id", identity.user.id)
      .eq("status", "ACTIVE");
    if (clearDefaultError) {
      await supabaseAdmin.from("supplier_portal_accounts").delete().eq("id", account.id);
      throw clearDefaultError;
    }

    const { data: defaultMembership, error: setDefaultError } = await supabaseAdmin
      .from("supplier_portal_account_members")
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq("id", membership.id)
      .eq("auth_user_id", identity.user.id)
      .select("id,supplier_account_id,auth_user_id,role,status,is_default")
      .single();

    if (setDefaultError) {
      if (previousDefaultIds.length) {
        await supabaseAdmin
          .from("supplier_portal_account_members")
          .update({ is_default: true, updated_at: new Date().toISOString() })
          .in("id", previousDefaultIds)
          .eq("auth_user_id", identity.user.id);
      }
      await supabaseAdmin.from("supplier_portal_accounts").delete().eq("id", account.id);
      throw setDefaultError;
    }
    finalMembership = defaultMembership;
  }

  return { success: true, account, membership: finalMembership };
}

async function supplierStorefrontContext(identity, { requireManage = false } = {}) {
  const resolved = await resolveSupplierAccount(identity);
  if (!resolved.account) {
    return { success: false, status: 404, error: "Supplier Network profile required" };
  }
  if (requireManage && !canManageSupplierAccount(resolved)) {
    return { success: false, status: 403, error: "Supplier owner or admin authority required" };
  }
  const { data: storefront, error: storefrontError } = await supabaseAdmin
    .from("supplier_storefronts")
    .select("id,supplier_account_id,currency_code")
    .eq("supplier_account_id", resolved.account.id)
    .maybeSingle();
  if (storefrontError) throw storefrontError;
  if (!storefront) {
    return { success: false, status: 404, error: "Supplier storefront required" };
  }
  return { success: true, resolved, account: resolved.account, storefront };
}

export async function supplierCustomerTerms({ relationshipId } = {}) {
  const identity = await requireSupplierPortalIdentity();
  if (!identity.success) return identity;
  const context = await supplierStorefrontContext(identity);
  if (!context.success) return context;

  const relationshipKey = text(relationshipId);
  if (!relationshipKey) {
    return { success: false, status: 400, error: "relationshipId required" };
  }

  const { data: relationship, error: relationshipError } = await supabaseAdmin
    .from("supplier_storefront_relationships")
    .select("id,storefront_id,organization_id,supplier_profile_id,supplier_party_id,status,pricing_mode,customer_visible,order_enabled")
    .eq("id", relationshipKey)
    .eq("storefront_id", context.storefront.id)
    .neq("status", "REVOKED")
    .maybeSingle();
  if (relationshipError) throw relationshipError;
  if (!relationship) {
    return { success: false, status: 404, error: "Supplier customer relationship not found" };
  }

  const [{ data: products, error: productError }, { data: terms, error: termsError }, { data: organizations, error: organizationError }] = await Promise.all([
    supabaseAdmin
      .from("supplier_storefront_products")
      .select("id,sku,name,uom,base_price,currency_code,minimum_order_quantity,is_active")
      .eq("storefront_id", context.storefront.id)
      .order("name", { ascending: true }),
    supabaseAdmin
      .from("supplier_storefront_product_terms")
      .select("id,relationship_id,product_id,customer_price,currency_code,minimum_order_quantity,is_active")
      .eq("relationship_id", relationship.id),
    supabaseAdmin
      .from("organizations")
      .select("id,name,legal_name")
      .eq("id", relationship.organization_id)
      .limit(1),
  ]);
  if (productError) throw productError;
  if (termsError) throw termsError;
  if (organizationError) throw organizationError;

  const termByProduct = new Map((terms || []).map((row) => [String(row.product_id), row]));
  return {
    success: true,
    relationship: {
      ...relationship,
      organization: (organizations || [])[0] || null,
    },
    products: (products || []).map((product) => ({
      ...product,
      customer_term: termByProduct.get(String(product.id)) || null,
    })),
  };
}

async function refreshSupplierRelationshipPricingMode(relationshipId, storefrontId) {
  const { data: remainingTerms, error: remainingTermsError } = await supabaseAdmin
    .from("supplier_storefront_product_terms")
    .select("id")
    .eq("relationship_id", relationshipId)
    .eq("is_active", true)
    .limit(1);
  if (remainingTermsError) throw remainingTermsError;

  const pricingMode = (remainingTerms || []).length ? "CUSTOM" : "BASE_PRICE";
  const { error: pricingModeError } = await supabaseAdmin
    .from("supplier_storefront_relationships")
    .update({ pricing_mode: pricingMode, updated_at: new Date().toISOString() })
    .eq("id", relationshipId)
    .eq("storefront_id", storefrontId);
  if (pricingModeError) throw pricingModeError;
  return pricingMode;
}

export async function setSupplierCustomerProductTerm(input = {}) {
  const identity = await requireSupplierPortalIdentity();
  if (!identity.success) return identity;
  const context = await supplierStorefrontContext(identity, { requireManage: true });
  if (!context.success) return context;

  const relationshipId = text(input.relationshipId ?? input.relationship_id);
  const productId = text(input.productId ?? input.product_id);
  if (!relationshipId || !productId) {
    return { success: false, status: 400, error: "relationshipId and productId are required" };
  }

  const [{ data: relationship, error: relationshipError }, { data: product, error: productError }] = await Promise.all([
    supabaseAdmin
      .from("supplier_storefront_relationships")
      .select("id,storefront_id")
      .eq("id", relationshipId)
      .eq("storefront_id", context.storefront.id)
      .neq("status", "REVOKED")
      .maybeSingle(),
    supabaseAdmin
      .from("supplier_storefront_products")
      .select("id,storefront_id,currency_code")
      .eq("id", productId)
      .eq("storefront_id", context.storefront.id)
      .maybeSingle(),
  ]);
  if (relationshipError) throw relationshipError;
  if (productError) throw productError;
  if (!relationship || !product) {
    return { success: false, status: 404, error: "Scoped supplier relationship or product not found" };
  }

  if (input.useBase === true) {
    const { error: deleteError } = await supabaseAdmin
      .from("supplier_storefront_product_terms")
      .delete()
      .eq("relationship_id", relationship.id)
      .eq("product_id", product.id);
    if (deleteError) throw deleteError;

    const pricingMode = await refreshSupplierRelationshipPricingMode(relationship.id, context.storefront.id);
    return { success: true, removed: true, relationshipId: relationship.id, productId: product.id, pricingMode };
  }

  const customerPriceRaw = input.customerPrice ?? input.customer_price;
  const minimumRaw = input.minimumOrderQuantity ?? input.minimum_order_quantity;
  const customerPrice = customerPriceRaw === "" || customerPriceRaw === null || customerPriceRaw === undefined
    ? null
    : Number(customerPriceRaw);
  const minimumOrderQuantity = minimumRaw === "" || minimumRaw === null || minimumRaw === undefined
    ? null
    : Number(minimumRaw);

  if (customerPrice !== null && (!Number.isFinite(customerPrice) || customerPrice < 0)) {
    return { success: false, status: 400, error: "Customer price must be zero or greater" };
  }
  if (minimumOrderQuantity !== null && (!Number.isFinite(minimumOrderQuantity) || minimumOrderQuantity <= 0)) {
    return { success: false, status: 400, error: "Customer minimum order quantity must be positive" };
  }

  if (customerPrice === null && minimumOrderQuantity === null) {
    const { error: deleteEmptyError } = await supabaseAdmin
      .from("supplier_storefront_product_terms")
      .delete()
      .eq("relationship_id", relationship.id)
      .eq("product_id", product.id);
    if (deleteEmptyError) throw deleteEmptyError;

    const pricingMode = await refreshSupplierRelationshipPricingMode(relationship.id, context.storefront.id);
    return { success: true, removed: true, relationshipId: relationship.id, productId: product.id, pricingMode };
  }

  const { data, error } = await supabaseAdmin
    .from("supplier_storefront_product_terms")
    .upsert({
      relationship_id: relationship.id,
      product_id: product.id,
      customer_price: customerPrice,
      currency_code: text(input.currencyCode ?? input.currency_code).toUpperCase() || product.currency_code || context.storefront.currency_code,
      minimum_order_quantity: minimumOrderQuantity,
      is_active: input.isActive !== false,
      updated_at: new Date().toISOString(),
    }, { onConflict: "relationship_id,product_id" })
    .select("*")
    .single();
  if (error) throw error;

  const pricingMode = await refreshSupplierRelationshipPricingMode(relationship.id, context.storefront.id);
  return { success: true, term: data, pricingMode };
}

const SUPPLIER_PURCHASE_ORDER_RESPONSE_TRANSITIONS = {
  PENDING: new Set(["ACKNOWLEDGED", "DECLINED"]),
  ACKNOWLEDGED: new Set(["IN_FULFILLMENT"]),
  DECLINED: new Set([]),
  IN_FULFILLMENT: new Set(["DISPATCHED"]),
  DISPATCHED: new Set([]),
};

export async function updateSupplierPurchaseOrderResponse(input = {}) {
  const identity = await requireSupplierPortalIdentity();
  if (!identity.success) return identity;

  const resolved = await resolveSupplierAccount(identity);
  if (!resolved.account || !resolved.membership) {
    return { success: false, status: 403, error: "Active Supplier profile membership required" };
  }

  const purchaseOrderId = text(input.purchaseOrderId ?? input.purchase_order_id);
  const requestedStatus = text(input.status ?? input.responseStatus ?? input.response_status).toUpperCase();
  if (!purchaseOrderId || !requestedStatus) {
    return { success: false, status: 400, error: "purchaseOrderId and status are required" };
  }
  if (!Object.prototype.hasOwnProperty.call(SUPPLIER_PURCHASE_ORDER_RESPONSE_TRANSITIONS, requestedStatus)) {
    return { success: false, status: 400, error: "Unsupported supplier order response status" };
  }

  const scope = await supplierRelationshipScope(identity, resolved.account);
  const organizationIds = [...new Set((scope.scopedAccess || []).map((row) => row.organization_id).filter(Boolean))];
  if (!organizationIds.length) {
    return { success: false, status: 403, error: "Assigned customer relationship required" };
  }

  const { data: purchaseOrder, error: purchaseOrderError } = await supabaseAdmin
    .from("purchase_orders")
    .select("id,organization_id,supplier_party_id,status,expected_delivery_date")
    .eq("id", purchaseOrderId)
    .in("organization_id", organizationIds)
    .maybeSingle();
  if (purchaseOrderError) throw purchaseOrderError;
  if (!purchaseOrder) {
    return { success: false, status: 404, error: "Purchase order not found in this Supplier profile" };
  }

  const access = (scope.scopedAccess || []).find((row) =>
    String(row.organization_id) === String(purchaseOrder.organization_id) &&
    String(row.supplier_party_id) === String(purchaseOrder.supplier_party_id)
  );
  if (!access) {
    return { success: false, status: 403, error: "Purchase order is outside this Supplier relationship" };
  }

  if (String(purchaseOrder.status || "").toUpperCase() !== "APPROVED") {
    return {
      success: false,
      status: 409,
      error: "Customer approval is required before the supplier can respond to this purchase order",
    };
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("supplier_purchase_order_responses")
    .select("*")
    .eq("supplier_account_id", resolved.account.id)
    .eq("purchase_order_id", purchaseOrder.id)
    .maybeSingle();
  if (existingError) throw existingError;

  const currentStatus = String(existing?.response_status || "PENDING").toUpperCase();
  if (
    requestedStatus !== currentStatus &&
    !SUPPLIER_PURCHASE_ORDER_RESPONSE_TRANSITIONS[currentStatus]?.has(requestedStatus)
  ) {
    return {
      success: false,
      status: 409,
      error: `Invalid supplier order transition ${currentStatus} → ${requestedStatus}`,
    };
  }

  const promisedDeliveryDate = text(input.promisedDeliveryDate ?? input.promised_delivery_date);
  if (promisedDeliveryDate && !/^\d{4}-\d{2}-\d{2}$/.test(promisedDeliveryDate)) {
    return { success: false, status: 400, error: "promisedDeliveryDate must use YYYY-MM-DD" };
  }

  const now = new Date().toISOString();
  const patch = {
    supplier_account_id: resolved.account.id,
    supplier_portal_access_id: access.id,
    organization_id: access.organization_id,
    purchase_order_id: purchaseOrder.id,
    supplier_party_id: access.supplier_party_id,
    response_status: requestedStatus,
    supplier_note: text(input.supplierNote ?? input.supplier_note).slice(0, 2000) || existing?.supplier_note || null,
    promised_delivery_date: promisedDeliveryDate || existing?.promised_delivery_date || purchaseOrder.expected_delivery_date || null,
    dispatch_reference: text(input.dispatchReference ?? input.dispatch_reference).slice(0, 300) || existing?.dispatch_reference || null,
    created_by_auth_user_id: existing?.created_by_auth_user_id || identity.user.id,
    updated_by_auth_user_id: identity.user.id,
    updated_at: now,
    acknowledged_at: existing?.acknowledged_at || null,
    declined_at: existing?.declined_at || null,
    dispatched_at: existing?.dispatched_at || null,
  };

  if (requestedStatus === "ACKNOWLEDGED" && !patch.acknowledged_at) patch.acknowledged_at = now;
  if (requestedStatus === "DECLINED" && !patch.declined_at) patch.declined_at = now;
  if (requestedStatus === "DISPATCHED" && !patch.dispatched_at) patch.dispatched_at = now;

  const { data, error } = await supabaseAdmin
    .from("supplier_purchase_order_responses")
    .upsert(patch, { onConflict: "supplier_account_id,purchase_order_id" })
    .select("*")
    .single();
  if (error) throw error;

  return {
    success: true,
    response: data,
    buyer_purchase_order_status: purchaseOrder.status,
  };
}

export async function supplierInvoiceSubmissionContext({ supplierPortalAccessId, purchaseOrderId } = {}) {
  const identity = await requireSupplierPortalIdentity();
  if (!identity.success) return identity;

  const resolved = await resolveSupplierAccount(identity);
  if (!resolved.account || !resolved.membership) {
    return { success: false, status: 403, error: "Active Supplier profile membership required" };
  }

  const scope = await supplierRelationshipScope(identity, resolved.account);
  const accessId = text(supplierPortalAccessId);
  let access = accessId
    ? (scope.scopedAccess || []).find((row) => String(row.id) === accessId)
    : null;

  let purchaseOrder = null;
  const poId = text(purchaseOrderId);
  if (poId) {
    const organizationIds = [...new Set((scope.scopedAccess || []).map((row) => row.organization_id).filter(Boolean))];
    const { data, error } = await supabaseAdmin
      .from("purchase_orders")
      .select("id,organization_id,entity_id,supplier_party_id,status,po_number,total_amount,currency,expected_delivery_date")
      .eq("id", poId)
      .in("organization_id", organizationIds)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { success: false, status: 404, error: "Purchase order not found in this Supplier profile" };
    purchaseOrder = data;

    access = (scope.scopedAccess || []).find((row) =>
      String(row.organization_id) === String(data.organization_id) &&
      String(row.supplier_party_id) === String(data.supplier_party_id)
    ) || null;
    if (!access) return { success: false, status: 403, error: "Purchase order is outside this Supplier relationship" };

    const poStatus = String(data.status || "").toUpperCase();
    if (!["APPROVED","RECEIVED"].includes(poStatus)) {
      return {
        success: false,
        status: 409,
        error: "Supplier invoice submission requires an approved or received purchase order",
      };
    }
  }

  if (!access) {
    if ((scope.scopedAccess || []).length === 1) access = scope.scopedAccess[0];
    else return { success: false, status: 400, error: "Choose the customer relationship for this invoice" };
  }

  if (accessId && String(access.id) !== accessId) {
    return { success: false, status: 403, error: "Customer relationship is outside this Supplier profile" };
  }

  return {
    success: true,
    identity,
    resolved,
    account: resolved.account,
    access,
    purchaseOrder,
  };
}

export async function supplierInvoiceSubmissions() {
  const identity = await requireSupplierPortalIdentity();
  if (!identity.success) return identity;
  const resolved = await resolveSupplierAccount(identity);
  if (!resolved.account) return { success: true, submissions: [] };

  const scope = await supplierRelationshipScope(identity, resolved.account);
  const organizationIds = [...new Set((scope.scopedAccess || []).map((row) => row.organization_id).filter(Boolean))];
  if (!organizationIds.length) return { success: true, submissions: [] };

  const { data, error } = await supabaseAdmin
    .from("supplier_invoice_submissions")
    .select("id,organization_id,entity_id,supplier_portal_access_id,purchase_order_id,organization_document_id,invoice_number,invoice_date,due_date,currency_code,total_amount,supplier_note,status,canonical_vendor_invoice_id,reviewed_at,review_note,created_at,updated_at")
    .eq("supplier_account_id", resolved.account.id)
    .in("organization_id", organizationIds)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const orgById = new Map();
  const documentIds = [...new Set((data || []).map((row) => row.organization_document_id).filter(Boolean))];
  const [{ data: organizations, error: organizationError }, { data: documents, error: documentError }] = await Promise.all([
    supabaseAdmin
      .from("organizations")
      .select("id,name,legal_name")
      .in("id", organizationIds),
    documentIds.length
      ? supabaseAdmin
          .from("organization_documents")
          .select("id,file_name,file_url,mime_type,status,approval_required,financial_impact")
          .in("id", documentIds)
          .in("organization_id", organizationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (organizationError) throw organizationError;
  if (documentError) throw documentError;
  for (const row of organizations || []) orgById.set(String(row.id), row);
  const documentById = new Map((documents || []).map((row) => [String(row.id), row]));

  const submissions = await Promise.all((data || []).map(async (row) => {
    const document = row.organization_document_id
      ? documentById.get(String(row.organization_document_id)) || null
      : null;
    return {
      ...row,
      customer: orgById.get(String(row.organization_id)) || null,
      document: document
        ? {
            ...document,
            file_url: await signedStorageReference(document.file_url),
          }
        : null,
    };
  }));

  return {
    success: true,
    submissions,
  };
}

function normalizeSupplierTeamEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function findSupplierAuthUserByEmail(email) {
  const normalized = normalizeSupplierTeamEmail(email);
  if (!normalized) return null;
  const perPage = 200;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    const match = users.find((user) => normalizeSupplierTeamEmail(user?.email) === normalized);
    if (match) return match;
    if (users.length < perPage) return null;
  }
  throw new Error("Unable to resolve supplier team authentication identity safely");
}

async function supplierTeamManageContext() {
  const identity = await requireSupplierPortalIdentity();
  if (!identity.success) return identity;
  const resolved = await resolveSupplierAccount(identity);
  if (!resolved.account || !canManageSupplierAccount(resolved)) {
    return { success: false, status: 403, error: "Supplier owner or admin authority required" };
  }
  return { success: true, identity, resolved, account: resolved.account };
}

export async function supplierTeamMembers() {
  const context = await supplierTeamManageContext();
  if (!context.success) return context;

  const { data: memberships, error } = await supabaseAdmin
    .from("supplier_portal_account_members")
    .select("id,supplier_account_id,auth_user_id,role,status,is_default,created_at,updated_at")
    .eq("supplier_account_id", context.account.id)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const members = [];
  for (const membership of memberships || []) {
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.getUserById(membership.auth_user_id);
    if (authError) throw authError;
    const authUser = authData?.user || null;
    members.push({
      ...membership,
      email: authUser?.email || null,
      display_name: authUser?.user_metadata?.display_name || authUser?.user_metadata?.full_name || null,
      invited_at: authUser?.invited_at || null,
      last_sign_in_at: authUser?.last_sign_in_at || null,
      is_current_user: String(membership.auth_user_id) === String(context.identity.user.id),
    });
  }

  return {
    success: true,
    supplier_account_id: context.account.id,
    members,
  };
}

export async function inviteSupplierTeamMember({ email, role = "MEMBER", redirectTo } = {}) {
  const context = await supplierTeamManageContext();
  if (!context.success) return context;

  const normalizedEmail = normalizeSupplierTeamEmail(email);
  const normalizedRole = String(role || "MEMBER").trim().toUpperCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { success: false, status: 400, error: "Valid team member email required" };
  }
  if (!["ADMIN","MEMBER"].includes(normalizedRole)) {
    return { success: false, status: 400, error: "Supplier team role must be ADMIN or MEMBER" };
  }
  if (normalizedEmail === normalizeSupplierTeamEmail(context.identity.user?.email)) {
    return { success: false, status: 409, error: "This login is already a member of the active Supplier profile" };
  }

  const existingAuthUser = await findSupplierAuthUserByEmail(normalizedEmail);
  if (existingAuthUser?.id) {
    const { data: existingMembership, error: existingMembershipError } = await supabaseAdmin
      .from("supplier_portal_account_members")
      .select("id,status,role")
      .eq("supplier_account_id", context.account.id)
      .eq("auth_user_id", existingAuthUser.id)
      .maybeSingle();
    if (existingMembershipError) throw existingMembershipError;

    if (existingMembership?.status === "ACTIVE") {
      return { success: false, status: 409, error: "This user is already an active member of the Supplier profile" };
    }

    let membership;
    if (existingMembership) {
      const { data, error } = await supabaseAdmin
        .from("supplier_portal_account_members")
        .update({ role: normalizedRole, status: "ACTIVE", is_default: false, updated_at: new Date().toISOString() })
        .eq("id", existingMembership.id)
        .eq("supplier_account_id", context.account.id)
        .select("*")
        .single();
      if (error) throw error;
      membership = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from("supplier_portal_account_members")
        .insert({
          supplier_account_id: context.account.id,
          auth_user_id: existingAuthUser.id,
          role: normalizedRole,
          status: "ACTIVE",
          is_default: false,
        })
        .select("*")
        .single();
      if (error) throw error;
      membership = data;
    }

    const { error: otpError } = await supabaseAdmin.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: redirectTo,
      },
    });
    if (otpError) {
      await supabaseAdmin
        .from("supplier_portal_account_members")
        .update({ status: "INACTIVE", is_default: false, updated_at: new Date().toISOString() })
        .eq("id", membership.id)
        .eq("supplier_account_id", context.account.id);
      throw otpError;
    }

    return {
      success: true,
      mode: "existing_auth_link",
      membership,
      email: normalizedEmail,
      message: "Existing Avantiqo identity linked to this Supplier profile and a sign-in link was sent.",
    };
  }

  const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, {
    redirectTo,
    data: {
      supplier_network_team: true,
      supplier_account_id: context.account.id,
      supplier_role: normalizedRole,
      display_name: normalizedEmail.split("@")[0] || null,
    },
  });
  if (inviteError) throw inviteError;

  const invitedUser = inviteData?.user || null;
  if (!invitedUser?.id) {
    return { success: false, status: 500, error: "Supplier team invitation did not return an authentication user" };
  }

  try {
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("supplier_portal_account_members")
      .insert({
        supplier_account_id: context.account.id,
        auth_user_id: invitedUser.id,
        role: normalizedRole,
        status: "ACTIVE",
        is_default: false,
      })
      .select("*")
      .single();
    if (membershipError) throw membershipError;

    return {
      success: true,
      mode: "invite",
      membership,
      email: normalizedEmail,
      message: "Supplier team invitation sent.",
    };
  } catch (error) {
    try { await supabaseAdmin.auth.admin.deleteUser(invitedUser.id); } catch {}
    throw error;
  }
}

export async function updateSupplierTeamMember({ membershipId, role, active } = {}) {
  const context = await supplierTeamManageContext();
  if (!context.success) return context;

  const memberId = text(membershipId);
  if (!memberId) return { success: false, status: 400, error: "membershipId required" };

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("supplier_portal_account_members")
    .select("id,supplier_account_id,auth_user_id,role,status,is_default")
    .eq("id", memberId)
    .eq("supplier_account_id", context.account.id)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) return { success: false, status: 404, error: "Supplier team member not found" };
  if (String(membership.role || "").toUpperCase() === "OWNER") {
    return { success: false, status: 409, error: "Supplier OWNER membership cannot be modified from team management" };
  }
  if (String(membership.auth_user_id) === String(context.identity.user.id)) {
    return { success: false, status: 409, error: "Use another Supplier OWNER or ADMIN to change your own team access" };
  }

  const patch = { updated_at: new Date().toISOString() };
  if (role !== undefined) {
    const normalizedRole = String(role || "").trim().toUpperCase();
    if (!["ADMIN","MEMBER"].includes(normalizedRole)) {
      return { success: false, status: 400, error: "Supplier team role must be ADMIN or MEMBER" };
    }
    patch.role = normalizedRole;
  }
  if (active !== undefined) {
    patch.status = active === false ? "INACTIVE" : "ACTIVE";
    if (active === false) patch.is_default = false;
  }

  const { data, error } = await supabaseAdmin
    .from("supplier_portal_account_members")
    .update(patch)
    .eq("id", membership.id)
    .eq("supplier_account_id", context.account.id)
    .select("*")
    .single();
  if (error) throw error;
  return { success: true, membership: data };
}

export async function supplierMediaUploadContext() {
  const identity = await requireSupplierPortalIdentity();
  if (!identity.success) return identity;
  const resolved = await resolveSupplierAccount(identity);
  if (!resolved.account || !canManageSupplierAccount(resolved)) {
    return { success: false, status: 403, error: "Supplier owner or admin authority required" };
  }
  return {
    success: true,
    identity,
    account: resolved.account,
    membership: resolved.membership,
  };
}
