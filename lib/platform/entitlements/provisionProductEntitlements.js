import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requiredModulesForProducts, productsFromLegacyModules } from "./productProvisioningRegistry";

function normalizeProductIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => typeof item === "string" ? item : item?.id).map((id) => String(id || "").trim()).filter(Boolean))];
}

export async function provisionProductEntitlements({
  organizationId,
  productIds = [],
  legacySelectedModules = [],
  subscriptionId = null,
  source = "manual",
  metadata = {},
  supabase = supabaseAdmin,
} = {}) {
  if (!organizationId) throw new Error("organizationId required");

  const exactProducts = normalizeProductIds(productIds);
  const resolvedProducts = exactProducts.length ? exactProducts : productsFromLegacyModules(legacySelectedModules);
  if (!resolvedProducts.length) return { productIds: [], moduleIds: [], source: exactProducts.length ? "products" : "none" };

  const moduleIds = requiredModulesForProducts(resolvedProducts);
  const { data: platformModules, error: platformError } = await supabase
    .from("platform_modules")
    .select("id,status")
    .in("id", moduleIds);
  if (platformError) throw platformError;

  const activeModuleIds = new Set((platformModules || [])
    .filter((row) => String(row.status || "").toLowerCase() === "active")
    .map((row) => row.id));
  const unavailable = moduleIds.filter((id) => !activeModuleIds.has(id));
  if (unavailable.length) throw new Error(`PRODUCT_REQUIRED_MODULE_UNAVAILABLE:${unavailable.join(",")}`);

  const entitlementRows = resolvedProducts.map((productId) => ({
    organization_id: organizationId,
    product_id: productId,
    status: "active",
    source,
    subscription_id: subscriptionId,
    metadata,
    updated_at: new Date().toISOString(),
  }));
  const entitlementResult = await supabase
    .from("organization_product_entitlements")
    .upsert(entitlementRows, { onConflict: "organization_id,product_id" })
    .select("product_id,status,source,subscription_id");
  if (entitlementResult.error) throw entitlementResult.error;

  if (moduleIds.length) {
    const moduleRows = moduleIds.map((moduleId) => ({ organization_id: organizationId, module_id: moduleId, status: "ACTIVE" }));
    const moduleResult = await supabase
      .from("organization_modules")
      .upsert(moduleRows, { onConflict: "organization_id,module_id" })
      .select("module_id,status");
    if (moduleResult.error) throw moduleResult.error;
  }

  return {
    productIds: resolvedProducts,
    moduleIds,
    source: exactProducts.length ? "products" : "legacy_modules",
  };
}

export async function provisionSubscriptionProducts(subscription, options = {}) {
  if (!subscription?.organization_id) throw new Error("SUBSCRIPTION_ORGANIZATION_REQUIRED");
  return provisionProductEntitlements({
    organizationId: subscription.organization_id,
    productIds: subscription.selected_products || [],
    legacySelectedModules: subscription.selected_modules || [],
    subscriptionId: subscription.id || null,
    source: "subscription",
    metadata: { provisioning_source: "subscription", compatibility_fallback: !Array.isArray(subscription.selected_products) || subscription.selected_products.length === 0 },
    ...options,
  });
}
