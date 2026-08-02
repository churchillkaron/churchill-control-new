export const dynamic = "force-dynamic";

import resolvePOSRequestApplication from "@/lib/operations/commerce/server/resolvePOSRequestApplication";

function errorResponse(error, status = 500) {
  return Response.json({ success: false, error }, { status });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const resolved = await resolvePOSRequestApplication({
      request,
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
      requestedApplicationId:
        searchParams.get("applicationId") ||
        searchParams.get("application_id") ||
        request.headers.get("x-pos-application"),
    });

    if (!resolved.success) {
      return errorResponse(resolved.error, resolved.status || 403);
    }

    const orderAdapter = resolved.application.adapter?.orders;
    if (typeof orderAdapter?.listOrders !== "function") {
      return errorResponse(
        `Order queries are not available for application ${resolved.application.id}`,
        501
      );
    }

    const orders = await orderAdapter.listOrders({
      access: resolved.access,
      organization: resolved.organization,
      organizationId: resolved.organizationId,
      request,
      settings: resolved.settings,
    });

    return Response.json({
      success: true,
      application: {
        id: resolved.application.id,
        name: resolved.application.name,
      },
      presentation: resolved.application.presentation || {},
      orders,
    });
  } catch (error) {
    console.error("POS ORDERS ERROR", error);
    return errorResponse(
      error?.message || "Unable to load POS orders",
      error?.status || 500
    );
  }
}
