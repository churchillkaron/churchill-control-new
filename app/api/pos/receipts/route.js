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

    const listReceipts = resolved.application.adapter?.receipts?.listReceipts;
    if (typeof listReceipts !== "function") {
      return errorResponse(
        `Receipts are not available for application ${resolved.application.id}`,
        501
      );
    }

    const orderId =
      searchParams.get("order_id") || searchParams.get("orderId") || null;
    const receipts = await listReceipts({
      access: resolved.access,
      application: resolved.application,
      organization: resolved.organization,
      organizationId: resolved.organizationId,
      orderId,
      request,
      settings: resolved.settings,
    });

    return Response.json({
      success: true,
      application_id: resolved.application.id,
      presentation: resolved.application.presentation || null,
      receipts,
      receipt: orderId ? receipts[0] || null : null,
    });
  } catch (error) {
    console.error("POS RECEIPTS ERROR", error);
    return errorResponse(
      error?.message || "Unable to load receipts",
      error?.status || 500
    );
  }
}
