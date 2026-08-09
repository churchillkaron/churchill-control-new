export const dynamic = "force-dynamic";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { listCommercialCatalog } from "@/lib/commercial/sales/CommercialDocumentContext";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
      request,
    });

    if (!access.success) {
      return Response.json(
        { success: false, error: access.error, items: [] },
        { status: access.status || 403 }
      );
    }

    const items = await listCommercialCatalog({
      organizationId: access.organizationId,
      query: searchParams.get("query") || "",
      limit: searchParams.get("limit"),
    });

    return Response.json({
      success: true,
      organization_id: access.organizationId,
      items,
      rows: items,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Unable to load catalog", items: [] },
      { status: error?.status || 500 }
    );
  }
}
