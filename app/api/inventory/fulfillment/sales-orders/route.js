export const dynamic = "force-dynamic";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { fulfillSalesOrder } from "@/lib/inventory/fulfillment/fulfillSalesOrder";

function value(source, camelKey, snakeKey) {
  return source?.[camelKey] ?? source?.[snakeKey] ?? null;
}

function errorResponse(error, status = 500) {
  return Response.json(
    {
      success: false,
      error,
    },
    { status }
  );
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = value(body, "organizationId", "organization_id");

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status || 403);
    }

    const result = await fulfillSalesOrder({
      access,
      body,
      organizationId: access.organizationId,
      request,
    });

    return Response.json(result);
  } catch (error) {
    return errorResponse(
      error?.message || "Unable to fulfill sales order",
      error?.status || 500
    );
  }
}
