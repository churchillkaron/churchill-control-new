import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

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

  await syncSupplierStorefrontRelationships(identity, storefront.id);
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

  if (storefront) {
    await syncSupplierStorefrontRelationships(
      { ...identity, access: relationshipScope.scopedAccess },
      storefront.id,
    );
  }

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
    const [orderResult, invoiceResult, paymentResult] = await Promise.all([
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
    ]);
    if (orderResult.error) throw orderResult.error;
    if (invoiceResult.error) throw invoiceResult.error;
    if (paymentResult.error) throw paymentResult.error;

    const customer = orgById.get(String(access.organization_id)) || null;
    orders.push(...(orderResult.data || []).map((row) => ({ ...row, customer })));
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
    display_name: text(input.display_name ?? input.displayName) || account.display_name || null,
    business_name: text(input.business_name ?? input.businessName) || account.business_name || null,
    phone: text(input.phone) || null,
    website: text(input.website) || null,
    updated_at: new Date().toISOString(),
  };
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
    return { success: true, request: data };
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
    return { success: true, connected: true, link: existingLink };
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

  return { success: true, connected: true, link, supplier_profile: supplierProfile };
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
