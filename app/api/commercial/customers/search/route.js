export const dynamic = "force-dynamic";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { listCustomers } from "@/lib/commercial/customers/CustomerService";

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId:
        body.organizationId ||
        body.organization_id ||
        null,
      request,
    });

    if (!access.success) {
      return Response.json(
        {
          success: false,
          error: access.error,
        },
        { status: access.status || 403 }
      );
    }

    const customers = await listCustomers({
      organizationId: access.organizationId,
      query: body.query || "",
      limit: 20,
    });

    return Response.json({
      success: true,
      customers,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || "Customer search failed",
      },
      { status: error?.status || 500 }
    );
  }
}
