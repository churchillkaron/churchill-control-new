import { productCatalog } from "@/components/public/productCatalog";
import { isCustomerProduct } from "@/components/public/customerProductGroups";
import { provisionProductEntitlements } from "@/lib/platform/entitlements/provisionProductEntitlements";
import { PRODUCT_MODULE_REQUIREMENTS } from "@/lib/platform/entitlements/productProvisioningRegistry";
import { requirePlatformOperatorWorkspaceAccess } from "@/lib/platform/security/requirePlatformOperatorWorkspaceAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PLATFORM_ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const PRODUCT_BY_ID = new Map(productCatalog.filter(isCustomerProduct).map((product) => [product.id, product]));

function text(value) { return String(value ?? "").trim(); }

async function requireOperator(request) {
  const url = new URL(request.url);
  const organizationId = text(url.searchParams.get("organization_id") || url.searchParams.get("organizationId"));
  const access = await requirePlatformOperatorWorkspaceAccess({ organizationId });
  if (!access.success) return access;
  if (access.organizationId !== PLATFORM_ORGANIZATION_ID) {
    return { success: false, status: 404, error: "Avantiqo Platform owner workspace required" };
  }
  return access;
}

export async function GET(request) {
  try {
    const access = await requireOperator(request);
    if (!access.success) return Response.json({ success: false, error: access.error }, { status: access.status });

    const [organizationsResult, entitlementsResult] = await Promise.all([
      supabaseAdmin.from("organizations")
        .select("id,name,organization_type,status,organization_status")
        .neq("id", PLATFORM_ORGANIZATION_ID)
        .order("name", { ascending: true }),
      supabaseAdmin.from("organization_product_entitlements")
        .select("organization_id,product_id,status,source,subscription_id,starts_at,ends_at,updated_at")
        .in("status", ["active", "trial"])
        .order("updated_at", { ascending: false }),
    ]);
    if (organizationsResult.error) throw organizationsResult.error;
    if (entitlementsResult.error) throw entitlementsResult.error;

    return Response.json({
      success: true,
      organizations: organizationsResult.data || [],
      entitlements: entitlementsResult.data || [],
      provisionable_product_ids: Object.keys(PRODUCT_MODULE_REQUIREMENTS),
    });
  } catch (error) {
    console.error("PRODUCT_ENTITLEMENT_ADMIN_GET_ERROR", error);
    return Response.json({ success: false, error: error?.message || "Unable to load product entitlements" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const access = await requireOperator(request);
    if (!access.success) return Response.json({ success: false, error: access.error }, { status: access.status });

    const body = await request.json().catch(() => ({}));
    const targetOrganizationId = text(body.organizationId || body.organization_id);
    const productId = text(body.productId || body.product_id);
    if (!targetOrganizationId || !productId) {
      return Response.json({ success: false, error: "Organization and product are required" }, { status: 400 });
    }
    if (targetOrganizationId === PLATFORM_ORGANIZATION_ID) {
      return Response.json({ success: false, error: "Use customer organizations for commercial product grants" }, { status: 400 });
    }
    const product = PRODUCT_BY_ID.get(productId);
    if (!product) return Response.json({ success: false, error: "Unknown customer product" }, { status: 400 });
    if (!PRODUCT_MODULE_REQUIREMENTS[productId]) {
      return Response.json({ success: false, error: "This product does not have a verified runtime provisioning map yet" }, { status: 409 });
    }

    const { data: organization, error: organizationError } = await supabaseAdmin
      .from("organizations").select("id,name").eq("id", targetOrganizationId).maybeSingle();
    if (organizationError) throw organizationError;
    if (!organization) return Response.json({ success: false, error: "Customer organization not found" }, { status: 404 });

    const provisioning = await provisionProductEntitlements({
      organizationId: targetOrganizationId,
      productIds: [productId],
      source: "manual",
      metadata: {
        assigned_from: "product_control",
        assigned_by_staff_account_id: access.staff?.id || null,
      },
    });

    return Response.json({ success: true, organization, product: { id: product.id, name: product.name }, provisioning });
  } catch (error) {
    console.error("PRODUCT_ENTITLEMENT_ADMIN_POST_ERROR", error);
    return Response.json({ success: false, error: error?.message || "Unable to grant product" }, { status: 500 });
  }
}
