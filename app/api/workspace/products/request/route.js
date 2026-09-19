import { productCatalog } from "@/components/public/productCatalog";
import { isCustomerProduct } from "@/components/public/customerProductGroups";
import { PRODUCT_MODULE_REQUIREMENTS } from "@/lib/platform/entitlements/productProvisioningRegistry";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PLATFORM_ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const PRODUCT_BY_ID = new Map(productCatalog.filter(isCustomerProduct).map((product) => [product.id, product]));

function text(value) { return String(value ?? "").trim(); }
function normalizeProductIds(value) {
  const list = Array.isArray(value) ? value : [value];
  return [...new Set(list.map(text).filter(Boolean))];
}

function productIdsFrom(value) {
  return Array.isArray(value) ? value.map((item) => typeof item === "string" ? item : item?.id).map(text).filter(Boolean) : [];
}

function statusForStage(stage) {
  const normalized = text(stage).toUpperCase();
  if (["COMMITTED", "CUSTOMER_CREATED", "HUMAN_ACTIVE", "FIRST_VALUE"].includes(normalized)) return "approved";
  if (["PROSPECT", "QUALIFIED", "COMMITMENT_PENDING"].includes(normalized)) return "in_review";
  return null;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return Response.json({ success: false, error: access.error }, { status: access.status });

    const [{ data: entitlements, error: entitlementError }, { data: leads, error: leadError }] = await Promise.all([
      supabaseAdmin
        .from("organization_product_entitlements")
        .select("product_id,status,created_at,updated_at")
        .eq("organization_id", access.organizationId)
        .in("status", ["active", "trial"]),
      supabaseAdmin
        .from("organization_leads")
        .select("id,status,selected_products,created_at")
        .eq("requesting_organization_id", access.organizationId)
        .eq("request_type", "upgrade")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (entitlementError) throw entitlementError;
    if (leadError) throw leadError;

    const leadIds = (leads || []).map((row) => row.id).filter(Boolean);
    let acquisitions = [];
    if (leadIds.length) {
      const { data, error } = await supabaseAdmin
        .from("platform_acquisition_records")
        .select("id,lead_id,subscription_id,stage,stage_updated_at,updated_at")
        .eq("seller_organization_id", PLATFORM_ORGANIZATION_ID)
        .in("lead_id", leadIds);
      if (error) throw error;
      acquisitions = data || [];
    }

    const acquisitionByLead = new Map(acquisitions.map((row) => [row.lead_id, row]));
    const statusByProduct = new Map();

    for (const lead of leads || []) {
      const acquisition = acquisitionByLead.get(lead.id);
      const mapped = statusForStage(acquisition?.stage) || "requested";
      if (text(acquisition?.stage).toUpperCase() === "LOST") continue;
      for (const productId of productIdsFrom(lead.selected_products)) {
        if (!PRODUCT_BY_ID.has(productId)) continue;
        const current = statusByProduct.get(productId);
        const rank = { requested: 1, in_review: 2, approved: 3, active: 4 };
        if (!current || rank[mapped] > rank[current.status]) {
          statusByProduct.set(productId, {
            productId,
            status: mapped,
            requestedAt: lead.created_at || null,
            acquisitionStage: acquisition?.stage || null,
            acquisitionId: acquisition?.id || null,
            updatedAt: acquisition?.stage_updated_at || acquisition?.updated_at || lead.created_at || null,
          });
        }
      }
    }

    for (const entitlement of entitlements || []) {
      statusByProduct.set(entitlement.product_id, {
        productId: entitlement.product_id,
        status: "active",
        entitlementStatus: entitlement.status,
        updatedAt: entitlement.updated_at || entitlement.created_at || null,
      });
    }

    return Response.json({
      success: true,
      products: [...statusByProduct.values()],
      authority: "AVANTIQO_CUSTOMER_PRODUCT_COMMERCIAL_STATUS",
    });
  } catch (error) {
    console.error("WORKSPACE_PRODUCT_REQUEST_STATUS_ERROR", error);
    return Response.json({ success: false, error: error?.message || "Unable to read product request status" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const url = new URL(request.url);
    const organizationId = text(body.organizationId || body.organization_id || url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return Response.json({ success: false, error: access.error }, { status: access.status });
    if (access.organizationId === PLATFORM_ORGANIZATION_ID) return Response.json({ success: false, error: "Use Product Control for Avantiqo Platform provisioning" }, { status: 409 });

    const productIds = normalizeProductIds(body.productIds || body.product_ids || body.productId || body.product_id);
    if (!productIds.length) return Response.json({ success: false, error: "Select at least one Avantiqo product" }, { status: 400 });
    for (const productId of productIds) {
      if (!PRODUCT_BY_ID.has(productId)) return Response.json({ success: false, error: `Unknown customer product: ${productId}` }, { status: 400 });
      if (!PRODUCT_MODULE_REQUIREMENTS[productId]) return Response.json({ success: false, error: `${PRODUCT_BY_ID.get(productId)?.name || productId} is not available for commercial provisioning yet` }, { status: 409 });
    }

    const { data: existingEntitlements, error: entitlementError } = await supabaseAdmin
      .from("organization_product_entitlements")
      .select("product_id,status")
      .eq("organization_id", access.organizationId)
      .in("product_id", productIds);
    if (entitlementError) throw entitlementError;
    const alreadyOwned = new Set((existingEntitlements || []).filter((row) => ["active", "trial"].includes(text(row.status).toLowerCase())).map((row) => row.product_id));
    const requestedIds = productIds.filter((id) => !alreadyOwned.has(id));
    if (!requestedIds.length) return Response.json({ success: false, error: "Your organization already has access to the selected product" }, { status: 409 });

    const { data: organization, error: organizationError } = await supabaseAdmin
      .from("organizations")
      .select("id,name,legal_name")
      .eq("id", access.organizationId)
      .maybeSingle();
    if (organizationError) throw organizationError;
    if (!organization) return Response.json({ success: false, error: "Organization not found" }, { status: 404 });

    const { data: priorUpgradeLeads, error: priorUpgradeLeadError } = await supabaseAdmin
      .from("organization_leads")
      .select("id,status,selected_products,created_at")
      .eq("requesting_organization_id", access.organizationId)
      .eq("request_type", "upgrade")
      .order("created_at", { ascending: false })
      .limit(200);
    if (priorUpgradeLeadError) throw priorUpgradeLeadError;

    const priorLeadIds = (priorUpgradeLeads || []).map((lead) => lead.id).filter(Boolean);
    let priorAcquisitions = [];
    if (priorLeadIds.length) {
      const { data, error } = await supabaseAdmin
        .from("platform_acquisition_records")
        .select("lead_id,stage")
        .eq("seller_organization_id", PLATFORM_ORGANIZATION_ID)
        .in("lead_id", priorLeadIds);
      if (error) throw error;
      priorAcquisitions = data || [];
    }

    const acquisitionStageByLead = new Map(priorAcquisitions.map((row) => [row.lead_id, text(row.stage).toUpperCase()]));
    const inFlightProductIds = new Set();
    for (const lead of priorUpgradeLeads || []) {
      const stage = acquisitionStageByLead.get(lead.id);
      if (stage === "LOST") continue;
      for (const productId of productIdsFrom(lead.selected_products)) {
        if (PRODUCT_BY_ID.has(productId)) inFlightProductIds.add(productId);
      }
    }

    const newIds = requestedIds.filter((id) => !inFlightProductIds.has(id));
    if (!newIds.length) return Response.json({ success: true, alreadyRequested: true, message: "This upgrade request is already with Avantiqo." });

    const selectedProducts = newIds.map((id) => ({ id, name: PRODUCT_BY_ID.get(id).name }));
    const contact = text(access.staff?.full_name || access.staff?.name || access.staff?.display_name || access.userEmail || "Avantiqo customer");
    const email = text(access.userEmail).toLowerCase();
    const note = text(body.note || body.request_note);
    const { data: lead, error: leadError } = await supabaseAdmin
      .from("organization_leads")
      .insert({
        organization_id: PLATFORM_ORGANIZATION_ID,
        requesting_organization_id: access.organizationId,
        company: text(organization.legal_name || organization.name || access.organizationId),
        contact,
        email,
        currency: "THB",
        status: "new",
        selected_products: selectedProducts,
        selected_modules: [],
        request_type: "upgrade",
        request_note: note || null,
        challenges: `Existing Avantiqo customer requested ${selectedProducts.map((product) => product.name).join(", ")} from the workspace product catalog.`,
      })
      .select("id,requesting_organization_id,status,selected_products,created_at")
      .single();
    if (leadError) throw leadError;

    return Response.json({ success: true, request: lead, message: "Your product request has been sent to Avantiqo." }, { status: 201 });
  } catch (error) {
    console.error("WORKSPACE_PRODUCT_REQUEST_ERROR", error);
    return Response.json({ success: false, error: error?.message || "Unable to send product request" }, { status: 500 });
  }
}
