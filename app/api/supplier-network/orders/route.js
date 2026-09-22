import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { createSupplierNetworkPurchaseOrder } from "@/lib/supplier-network/SupplierNetworkRuntime";

export const dynamic = "force-dynamic";

const ORDER_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "MANAGER",
  "PROCUREMENT",
]);

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = String(body?.organizationId || body?.organization_id || "").trim();
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return Response.json({ success: false, error: access.error }, { status: access.status || 403 });
    }
    if (!ORDER_ROLES.has(String(access.role || "").trim().toUpperCase())) {
      return Response.json({ success: false, error: "Procurement or owner authority required" }, { status: 403 });
    }

    const result = await createSupplierNetworkPurchaseOrder({
      organizationId: access.organizationId,
      entityId: body?.entityId || body?.entity_id,
      supplierAccountId: body?.supplierAccountId || body?.supplier_account_id,
      selections: body?.selections || body?.items || [],
      orderedBy: access.userId || "SUPPLIER_NETWORK",
    });
    return Response.json(result, { status: result?.success === false ? (result.status || 500) : 200 });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Unable to create Supplier Network purchase order" },
      { status: 500 },
    );
  }
}
