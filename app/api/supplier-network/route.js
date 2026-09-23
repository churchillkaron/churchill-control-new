import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  requestSupplierConnection,
  searchSupplierNetwork,
} from "@/lib/supplier-network/SupplierNetworkRuntime";

export const dynamic = "force-dynamic";

const CONNECTION_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "MANAGER",
  "PROCUREMENT",
]);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId") || searchParams.get("organization_id");
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return Response.json({ success: false, error: access.error, suppliers: [] }, { status: access.status || 403 });
    }

    const suppliers = await searchSupplierNetwork({
      query: searchParams.get("query") || "",
      limit: searchParams.get("limit") || 60,
    });

    const supplierAccountIds = suppliers.map((supplier) => supplier.supplier_account_id).filter(Boolean);
    let relationshipBySupplier = new Map();
    if (supplierAccountIds.length) {
      const [{ data: links, error: linkError }, { data: requests, error: requestError }] = await Promise.all([
        supabaseAdmin
          .from("supplier_network_customer_links")
          .select("supplier_account_id,supplier_party_id,supplier_profile_id,supplier_portal_access_id")
          .eq("organization_id", access.organizationId)
          .in("supplier_account_id", supplierAccountIds),
        supabaseAdmin
          .from("supplier_network_connection_requests")
          .select("supplier_account_id,status")
          .eq("organization_id", access.organizationId)
          .in("supplier_account_id", supplierAccountIds),
      ]);
      if (linkError) throw linkError;
      if (requestError) throw requestError;
      relationshipBySupplier = new Map((requests || []).map((row) => [String(row.supplier_account_id), { status: row.status }]));
      const connectedLinks = links || [];
      const portalAccessIds = connectedLinks.map((link) => link.supplier_portal_access_id).filter(Boolean);
      const { data: storefrontRelationships, error: storefrontRelationshipError } = portalAccessIds.length
        ? await supabaseAdmin
            .from("supplier_storefront_relationships")
            .select("id,storefront_id,supplier_portal_access_id,pricing_mode")
            .in("supplier_portal_access_id", portalAccessIds)
            .eq("status", "ACTIVE")
        : { data: [], error: null };
      if (storefrontRelationshipError) throw storefrontRelationshipError;

      const storefrontRelationshipByAccess = new Map(
        (storefrontRelationships || []).map((row) => [String(row.supplier_portal_access_id), row]),
      );
      const relationshipIds = (storefrontRelationships || []).map((row) => row.id);
      const { data: productTerms, error: productTermsError } = relationshipIds.length
        ? await supabaseAdmin
            .from("supplier_storefront_product_terms")
            .select("relationship_id,product_id,customer_price,currency_code,minimum_order_quantity,is_active")
            .in("relationship_id", relationshipIds)
            .eq("is_active", true)
        : { data: [], error: null };
      if (productTermsError) throw productTermsError;
      const termsByRelationshipAndProduct = new Map(
        (productTerms || []).map((row) => [String(row.relationship_id) + ":" + String(row.product_id), row]),
      );

      for (const link of connectedLinks) {
        const storefrontRelationship = storefrontRelationshipByAccess.get(String(link.supplier_portal_access_id)) || null;
        relationshipBySupplier.set(String(link.supplier_account_id), {
          status: "CONNECTED",
          supplier_party_id: link.supplier_party_id,
          supplier_profile_id: link.supplier_profile_id,
          supplier_portal_access_id: link.supplier_portal_access_id,
          storefront_relationship_id: storefrontRelationship?.id || null,
          pricing_mode: storefrontRelationship?.pricing_mode || "BASE_PRICE",
          termsByProduct: storefrontRelationship
            ? Object.fromEntries(
                suppliers
                  .flatMap((supplier) => supplier.products || [])
                  .map((product) => {
                    const term = termsByRelationshipAndProduct.get(String(storefrontRelationship.id) + ":" + String(product.id));
                    return term ? [String(product.id), term] : null;
                  })
                  .filter(Boolean),
              )
            : {},
        });
      }
    }

    return Response.json({
      success: true,
      organization_id: access.organizationId,
      suppliers: suppliers.map((supplier) => {
        const relationship = relationshipBySupplier.get(String(supplier.supplier_account_id)) || { status: "NONE" };
        const termsByProduct = relationship.termsByProduct || {};
        const relationshipView = { ...relationship };
        delete relationshipView.termsByProduct;
        return {
          ...supplier,
          products: (supplier.products || []).map((product) => {
            const term = termsByProduct[String(product.id)] || null;
            return {
              ...product,
              effective_price: term?.customer_price ?? product.base_price,
              effective_currency_code: term?.currency_code || product.currency_code,
              effective_minimum_order_quantity: term?.minimum_order_quantity ?? product.minimum_order_quantity,
              pricing_source: term ? "CUSTOM" : "BASE",
            };
          }),
          relationship: relationshipView,
        };
      }),
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Unable to search supplier network", suppliers: [] },
      { status: 500 },
    );
  }
}


export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = String(body?.organizationId || "").trim();
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return Response.json({ success: false, error: access.error }, { status: access.status || 403 });
    }
    if (!CONNECTION_ROLES.has(String(access.role || "").trim().toUpperCase())) {
      return Response.json({ success: false, error: "Procurement or owner authority required" }, { status: 403 });
    }

    const result = await requestSupplierConnection({
      organizationId: access.organizationId,
      storefrontId: body?.storefrontId,
      userId: access.userId,
      buyerNote: body?.buyerNote,
    });
    return Response.json(result, { status: result?.success === false ? (result.status || 500) : 200 });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Unable to request supplier connection" },
      { status: 500 },
    );
  }
}
