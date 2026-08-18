export const dynamic = "force-dynamic";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { returnSalesOrderFulfillment } from "@/lib/inventory/fulfillment/returnSalesOrderFulfillment";

function value(source, camelKey, snakeKey) {
  return source?.[camelKey] ?? source?.[snakeKey] ?? null;
}

function errorResponse(error, status = 500) {
  return Response.json(
    {
      success: false,
      error,
    },
    { status },
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

    const result = await returnSalesOrderFulfillment({
      access,
      body,
      organizationId: access.organizationId,
    });

    return Response.json(result);
  } catch (error) {
    return errorResponse(
      error?.message || "Unable to return sales-order fulfillment",
      error?.status || 500,
    );
  }
}
