import { productCatalog } from "@/components/public/productCatalog";
import { isCustomerProduct } from "@/components/public/customerProductGroups";
import { PRODUCT_MODULE_REQUIREMENTS } from "@/lib/platform/entitlements/productProvisioningRegistry";
import { requirePlatformOperatorWorkspaceAccess } from "@/lib/platform/security/requirePlatformOperatorWorkspaceAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PLATFORM_ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const PRODUCT_BY_ID = new Map(productCatalog.filter(isCustomerProduct).map((product) => [product.id, product]));

function text(value) { return String(value ?? "").trim(); }
function uuid(value) { const v = text(value); return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v) ? v : null; }

async function requireOperator(request) {
  const url = new URL(request.url);
  const organizationId = text(url.searchParams.get("organization_id") || url.searchParams.get("organizationId"));
  const access = await requirePlatformOperatorWorkspaceAccess({ organizationId });
  if (!access.success) return access;
  if (access.organizationId !== PLATFORM_ORGANIZATION_ID) return { success: false, status: 404, error: "Avantiqo Platform owner workspace required" };
  return access;
}

export async function POST(request) {
  try {
    const access = await requireOperator(request);
    if (!access.success) return Response.json({ success: false, error: access.error }, { status: access.status });
    const body = await request.json().catch(() => ({}));
    const acquisitionId = uuid(body.acquisitionId || body.acquisition_id);
    if (!acquisitionId) return Response.json({ success: false, error: "Acquisition is required" }, { status: 400 });

    const { data: acquisition, error: acquisitionError } = await supabaseAdmin
      .from("platform_acquisition_records")
      .select("id,lead_id,stage,prospect_company,prospect_email,subscription_id")
      .eq("id", acquisitionId)
      .eq("seller_organization_id", PLATFORM_ORGANIZATION_ID)
      .maybeSingle();
    if (acquisitionError) throw acquisitionError;
    if (!acquisition) return Response.json({ success: false, error: "Acquisition not found" }, { status: 404 });
    if (acquisition.stage !== "COMMITMENT_PENDING") return Response.json({ success: false, error: "Commercial subscription can only be recorded at Commitment Pending" }, { status: 409 });
    if (!acquisition.lead_id) return Response.json({ success: false, error: "A persisted lead is required before subscription commitment" }, { status: 409 });

    const { data: existingSubscription, error: existingSubscriptionError } = await supabaseAdmin
      .from("subscriptions")
      .select("id,lead_id,organization_id,company,email,currency,billing_cycle,final_monthly_total,final_yearly_total,selected_products,status,created_at")
      .eq("lead_id", acquisition.lead_id)
      .maybeSingle();
    if (existingSubscriptionError) throw existingSubscriptionError;
    if (existingSubscription) {
      return Response.json({
        success: true,
        subscription: existingSubscription,
        idempotent: true,
        authority: "AVANTIQO_PLATFORM_COMMERCIAL_SUBSCRIPTION_COMMITMENT",
      });
    }
    if (acquisition.subscription_id) return Response.json({ success: false, error: "This acquisition already has a canonical subscription" }, { status: 409 });

    const requestedIds = Array.isArray(body.productIds || body.product_ids) ? (body.productIds || body.product_ids) : [];
    const productIds = [...new Set(requestedIds.map(text).filter(Boolean))];
    if (!productIds.length) return Response.json({ success: false, error: "Select at least one Avantiqo product" }, { status: 400 });
    for (const productId of productIds) {
      if (!PRODUCT_BY_ID.has(productId)) return Response.json({ success: false, error: `Unknown customer product: ${productId}` }, { status: 400 });
      if (!PRODUCT_MODULE_REQUIREMENTS[productId]) return Response.json({ success: false, error: `${PRODUCT_BY_ID.get(productId)?.name || productId} does not have a verified provisioning map yet` }, { status: 409 });
    }

    const monthlyTotal = Number(body.monthlyTotal ?? body.monthly_total);
    if (!Number.isFinite(monthlyTotal) || monthlyTotal < 0) return Response.json({ success: false, error: "Monthly commercial total must be zero or greater" }, { status: 400 });
    const billingCycle = text(body.billingCycle || body.billing_cycle).toLowerCase() || "monthly";
    if (!new Set(["monthly", "yearly"]).has(billingCycle)) return Response.json({ success: false, error: "Billing cycle must be monthly or yearly" }, { status: 400 });
    const currency = text(body.currency).toUpperCase() || "THB";
    const selectedProducts = productIds.map((id) => ({ id, name: PRODUCT_BY_ID.get(id).name }));
    const yearlyTotal = Number((monthlyTotal * 12).toFixed(2));

    const { data: lead, error: leadError } = await supabaseAdmin
      .from("organization_leads")
      .select("id,company,email,phone,request_type,requesting_organization_id")
      .eq("id", acquisition.lead_id)
      .maybeSingle();
    if (leadError) throw leadError;
    if (!lead) return Response.json({ success: false, error: "Acquisition lead no longer exists" }, { status: 409 });

    let customerOrganizationId = null;
    if (text(lead.request_type).toLowerCase() === "upgrade") {
      customerOrganizationId = uuid(lead.requesting_organization_id);
      if (!customerOrganizationId || customerOrganizationId === PLATFORM_ORGANIZATION_ID) {
        return Response.json({ success: false, error: "Upgrade lead is missing a valid customer organization lineage" }, { status: 409 });
      }

      const { data: customerOrganization, error: customerOrganizationError } = await supabaseAdmin
        .from("organizations")
        .select("id,name,status,organization_status")
        .eq("id", customerOrganizationId)
        .maybeSingle();
      if (customerOrganizationError) throw customerOrganizationError;
      if (!customerOrganization) {
        return Response.json({ success: false, error: "Upgrade customer organization no longer exists" }, { status: 409 });
      }
    }

    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        lead_id: lead.id,
        organization_id: customerOrganizationId,
        company: text(lead.company) || text(acquisition.prospect_company) || null,
        email: text(lead.email) || text(acquisition.prospect_email) || null,
        phone: text(lead.phone) || null,
        currency,
        billing_cycle: billingCycle,
        subtotal: monthlyTotal,
        discount_total: 0,
        final_monthly_total: monthlyTotal,
        final_yearly_total: yearlyTotal,
        selected_products: selectedProducts,
        selected_modules: [],
        status: "committed",
        updated_at: new Date().toISOString(),
      })
      .select("id,lead_id,organization_id,company,email,currency,billing_cycle,final_monthly_total,final_yearly_total,selected_products,status,created_at")
      .single();
    if (subscriptionError) {
      if (subscriptionError.code === "23505") {
        const { data: canonicalSubscription, error: canonicalSubscriptionError } = await supabaseAdmin
          .from("subscriptions")
          .select("id,lead_id,organization_id,company,email,currency,billing_cycle,final_monthly_total,final_yearly_total,selected_products,status,created_at")
          .eq("lead_id", lead.id)
          .maybeSingle();
        if (canonicalSubscriptionError) throw canonicalSubscriptionError;
        if (canonicalSubscription) {
          return Response.json({
            success: true,
            subscription: canonicalSubscription,
            idempotent: true,
            authority: "AVANTIQO_PLATFORM_COMMERCIAL_SUBSCRIPTION_COMMITMENT",
          });
        }
      }
      throw subscriptionError;
    }

    return Response.json({ success: true, subscription, idempotent: false, authority: "AVANTIQO_PLATFORM_COMMERCIAL_SUBSCRIPTION_COMMITMENT" }, { status: 201 });
  } catch (error) {
    console.error("COMMERCIAL_SUBSCRIPTION_CREATE_ERROR", error);
    return Response.json({ success: false, error: error?.message || "Unable to create commercial subscription" }, { status: 500 });
  }
}
