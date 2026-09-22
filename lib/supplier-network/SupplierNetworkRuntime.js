import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import createPurchaseOrder from "@/lib/inventory/procurement/purchase-orders/createPurchaseOrder";

function cleanQuery(value) {
  return String(value ?? "").trim().toLowerCase().slice(0, 120);
}

export async function searchSupplierNetwork({ query = "", limit = 60 } = {}) {
  const normalized = cleanQuery(query);
  const capped = Math.max(1, Math.min(Number(limit) || 60, 100));

  const { data: accounts, error: accountError } = await supabaseAdmin
    .from("supplier_portal_accounts")
    .select("id,business_name,display_name,website,shop_verified,business_organization_id")
    .eq("shop_discoverable", true)
    .limit(capped * 2);
  if (accountError) throw accountError;
  if (!(accounts || []).length) return [];

  const accountIds = accounts.map((row) => row.id);
  const { data: storefronts, error: storefrontError } = await supabaseAdmin
    .from("supplier_storefronts")
    .select("id,supplier_account_id,slug,name,headline,description,currency_code,status,allow_customer_orders")
    .in("supplier_account_id", accountIds)
    .eq("status", "PUBLISHED")
    .limit(capped * 2);
  if (storefrontError) throw storefrontError;
  if (!(storefronts || []).length) return [];

  const storefrontIds = storefronts.map((row) => row.id);
  const { data: products, error: productError } = await supabaseAdmin
    .from("supplier_storefront_products")
    .select("id,storefront_id,sku,name,description,category,uom,base_price,currency_code,minimum_order_quantity,lead_time_days")
    .in("storefront_id", storefrontIds)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(capped * 20);
  if (productError) throw productError;

  const accountById = new Map((accounts || []).map((row) => [String(row.id), row]));
  const productsByStorefront = new Map();
  for (const product of products || []) {
    const key = String(product.storefront_id);
    const list = productsByStorefront.get(key) || [];
    list.push(product);
    productsByStorefront.set(key, list);
  }

  return (storefronts || [])
    .map((storefront) => {
      const account = accountById.get(String(storefront.supplier_account_id)) || {};
      const items = productsByStorefront.get(String(storefront.id)) || [];
      return {
        id: storefront.id,
        supplier_account_id: storefront.supplier_account_id,
        slug: storefront.slug,
        name: storefront.name,
        headline: storefront.headline,
        description: storefront.description,
        currency_code: storefront.currency_code,
        allow_customer_orders: storefront.allow_customer_orders,
        supplier: {
          business_name: account.business_name || account.display_name || storefront.name,
          website: account.website || null,
          verified: account.shop_verified === true,
          business_linked: Boolean(account.business_organization_id),
        },
        products: items,
      };
    })
    .filter((row) => {
      if (!normalized) return true;
      const haystack = [
        row.name,
        row.headline,
        row.description,
        row.supplier?.business_name,
        ...row.products.flatMap((product) => [product.name, product.description, product.category, product.sku]),
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(normalized);
    })
    .slice(0, capped);
}

export async function requestSupplierConnection({ organizationId, storefrontId, userId, buyerNote = "" }) {
  const orgId = String(organizationId || "").trim();
  const storeId = String(storefrontId || "").trim();
  if (!orgId || !storeId) return { success: false, status: 400, error: "organizationId and storefrontId are required" };

  const { data: storefront, error: storefrontError } = await supabaseAdmin
    .from("supplier_storefronts")
    .select("id,supplier_account_id,status")
    .eq("id", storeId)
    .eq("status", "PUBLISHED")
    .maybeSingle();
  if (storefrontError) throw storefrontError;
  if (!storefront) return { success: false, status: 404, error: "Published supplier shop not found" };

  const { data: account, error: accountError } = await supabaseAdmin
    .from("supplier_portal_accounts")
    .select("id,shop_discoverable")
    .eq("id", storefront.supplier_account_id)
    .eq("shop_discoverable", true)
    .maybeSingle();
  if (accountError) throw accountError;
  if (!account) return { success: false, status: 404, error: "Supplier is not available in the network" };

  const { data: existingLink, error: linkError } = await supabaseAdmin
    .from("supplier_network_customer_links")
    .select("id,supplier_portal_access_id")
    .eq("organization_id", orgId)
    .eq("supplier_account_id", account.id)
    .maybeSingle();
  if (linkError) throw linkError;
  if (existingLink) return { success: true, connected: true, link: existingLink };

  const { data: request, error } = await supabaseAdmin
    .from("supplier_network_connection_requests")
    .upsert({
      organization_id: orgId,
      supplier_account_id: account.id,
      requested_by_auth_user_id: userId || null,
      status: "PENDING",
      buyer_note: String(buyerNote || "").trim().slice(0, 1200) || null,
      supplier_note: null,
      responded_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id,supplier_account_id" })
    .select("*")
    .single();
  if (error) throw error;

  return { success: true, connected: false, request };
}


export async function createSupplierNetworkPurchaseOrder({
  organizationId,
  entityId,
  supplierAccountId,
  selections = [],
  orderedBy = "SUPPLIER_NETWORK",
}) {
  const orgId = String(organizationId || "").trim();
  const legalEntityId = String(entityId || "").trim();
  const accountId = String(supplierAccountId || "").trim();
  if (!orgId || !legalEntityId || !accountId) {
    return { success: false, status: 400, error: "organizationId, entityId and supplierAccountId are required" };
  }

  const requested = (Array.isArray(selections) ? selections : [])
    .map((row) => ({ productId: String(row?.productId || "").trim(), quantity: Number(row?.quantity || 0) }))
    .filter((row) => row.productId && Number.isFinite(row.quantity) && row.quantity > 0);
  if (!requested.length) return { success: false, status: 400, error: "At least one product quantity is required" };

  const { data: link, error: linkError } = await supabaseAdmin
    .from("supplier_network_customer_links")
    .select("supplier_party_id,supplier_profile_id,supplier_portal_access_id")
    .eq("organization_id", orgId)
    .eq("supplier_account_id", accountId)
    .maybeSingle();
  if (linkError) throw linkError;
  if (!link) return { success: false, status: 409, error: "Connect with this supplier before ordering" };

  const { data: storefront, error: storefrontError } = await supabaseAdmin
    .from("supplier_storefronts")
    .select("id,slug,currency_code,status,allow_customer_orders")
    .eq("supplier_account_id", accountId)
    .eq("status", "PUBLISHED")
    .maybeSingle();
  if (storefrontError) throw storefrontError;
  if (!storefront || storefront.allow_customer_orders !== true) {
    return { success: false, status: 409, error: "Supplier shop is not accepting customer orders" };
  }

  const { data: storefrontRelationship, error: relationshipError } = await supabaseAdmin
    .from("supplier_storefront_relationships")
    .select("id,pricing_mode")
    .eq("storefront_id", storefront.id)
    .eq("supplier_portal_access_id", link.supplier_portal_access_id)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (relationshipError) throw relationshipError;
  if (!storefrontRelationship) return { success: false, status: 409, error: "Supplier storefront relationship is not active" };

  const productIds = [...new Set(requested.map((row) => row.productId))];
  const { data: products, error: productError } = await supabaseAdmin
    .from("supplier_storefront_products")
    .select("id,name,sku,uom,base_price,currency_code,minimum_order_quantity,lead_time_days,is_active")
    .eq("storefront_id", storefront.id)
    .in("id", productIds)
    .eq("is_active", true);
  if (productError) throw productError;
  if ((products || []).length !== productIds.length) {
    return { success: false, status: 409, error: "One or more selected products are no longer available" };
  }

  const { data: terms, error: termsError } = await supabaseAdmin
    .from("supplier_storefront_product_terms")
    .select("product_id,customer_price,currency_code,minimum_order_quantity,is_active")
    .eq("relationship_id", storefrontRelationship.id)
    .in("product_id", productIds)
    .eq("is_active", true);
  if (termsError) throw termsError;

  const productById = new Map((products || []).map((row) => [String(row.id), row]));
  const termByProductId = new Map((terms || []).map((row) => [String(row.product_id), row]));
  const items = [];
  let currency = null;
  let maxLeadDays = 0;

  for (const selection of requested) {
    const product = productById.get(selection.productId);
    const term = termByProductId.get(selection.productId) || null;
    const minimum = Number(term?.minimum_order_quantity ?? product.minimum_order_quantity ?? 1);
    if (selection.quantity < minimum) {
      return { success: false, status: 409, error: product.name + " requires minimum order quantity " + minimum };
    }
    const price = Number(term?.customer_price ?? product.base_price ?? 0);
    const itemCurrency = String(term?.currency_code || product.currency_code || storefront.currency_code || "THB").toUpperCase();
    if (currency && currency !== itemCurrency) {
      return { success: false, status: 409, error: "One purchase order cannot mix product currencies" };
    }
    currency = itemCurrency;
    maxLeadDays = Math.max(maxLeadDays, Number(product.lead_time_days || 0));
    items.push({
      item_id: null,
      item_name: product.name + (product.sku ? " · " + product.sku : ""),
      qty: selection.quantity,
      unit_price: price,
    });
  }

  const expectedDelivery = new Date();
  expectedDelivery.setUTCDate(expectedDelivery.getUTCDate() + maxLeadDays);

  const result = await createPurchaseOrder({
    organization_id: orgId,
    entity_id: legalEntityId,
    supplier_party_id: link.supplier_party_id,
    items,
    ordered_by: orderedBy,
    currency: currency || storefront.currency_code || "THB",
    expected_delivery_date: expectedDelivery.toISOString().slice(0, 10),
    notes: "Created from Avantiqo Supplier Network · " + storefront.slug,
  });

  if (!result?.success) return { success: false, status: 500, error: result?.error || "Unable to create purchase order" };
  return {
    success: true,
    purchase_order: result.purchase_order,
    items: result.items,
    source: "SUPPLIER_NETWORK",
  };
}

export async function getPublicSupplierShop(slug) {
  const normalizedSlug = String(slug || "").trim().toLowerCase();
  if (!normalizedSlug) return null;

  const { data: storefront, error: storefrontError } = await supabaseAdmin
    .from("supplier_storefronts")
    .select("id,supplier_account_id,slug,name,headline,description,currency_code,status,allow_public_browse,allow_customer_orders")
    .eq("slug", normalizedSlug)
    .eq("status", "PUBLISHED")
    .eq("allow_public_browse", true)
    .maybeSingle();
  if (storefrontError) throw storefrontError;
  if (!storefront) return null;

  const [{ data: account, error: accountError }, { data: products, error: productError }] = await Promise.all([
    supabaseAdmin
      .from("supplier_portal_accounts")
      .select("id,business_name,display_name,website,shop_verified,business_organization_id,shop_discoverable")
      .eq("id", storefront.supplier_account_id)
      .maybeSingle(),
    supabaseAdmin
      .from("supplier_storefront_products")
      .select("id,sku,name,description,category,uom,base_price,currency_code,minimum_order_quantity,lead_time_days")
      .eq("storefront_id", storefront.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(500),
  ]);
  if (accountError) throw accountError;
  if (productError) throw productError;
  if (!account) return null;

  return {
    ...storefront,
    supplier: {
      business_name: account.business_name || account.display_name || storefront.name,
      website: account.website || null,
      verified: account.shop_verified === true,
      business_linked: Boolean(account.business_organization_id),
      network_discoverable: account.shop_discoverable === true,
    },
    products: products || [],
  };
}
