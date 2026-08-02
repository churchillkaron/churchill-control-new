export const dynamic = "force-dynamic";

import resolvePOSRequestApplication from "@/lib/operations/commerce/server/resolvePOSRequestApplication";

function readValue(source, camelKey, snakeKey) {
  return source?.[camelKey] ?? source?.[snakeKey] ?? null;
}

function errorResponse(error, status = 500) {
  return Response.json({ success: false, error }, { status });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const resolved = await resolvePOSRequestApplication({
      request,
      organizationId: readValue(body, "organizationId", "organization_id"),
      requestedApplicationId:
        body.applicationId ||
        body.application_id ||
        request.headers.get("x-pos-application"),
    });

    if (!resolved.success) {
      return errorResponse(resolved.error, resolved.status);
    }

    if (typeof resolved.application.adapter?.settlePayment !== "function") {
      return errorResponse(
        `Payment settlement is not available for application ${resolved.application.id}`,
        501
      );
    }

    return resolved.application.adapter.settlePayment({
      body,
      access: resolved.access,
      organization: resolved.organization,
      organizationId: resolved.organizationId,
      partial: Boolean(body.partial || body.is_partial),
      request,
    });
  } catch (error) {
    console.error("POS PAYMENT SETTLEMENT ERROR", error);
    return errorResponse(
      error?.message || "Payment settlement failed",
      error?.status || 500
    );
  }
}
