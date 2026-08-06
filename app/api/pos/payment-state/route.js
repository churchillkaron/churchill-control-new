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

    if (typeof resolved.application.adapter?.loadPaymentState !== "function") {
      return errorResponse(
        `Payment state is not available for application ${resolved.application.id}`,
        501
      );
    }

    const state = await resolved.application.adapter.loadPaymentState({
      body,
      access: resolved.access,
      organization: resolved.organization,
      organizationId: resolved.organizationId,
      request,
    });

    return Response.json({
      success: true,
      application_id: resolved.application.id,
      context: state.context || body.context || null,
      state,
    });
  } catch (error) {
    console.error("POS PAYMENT STATE ERROR", error);
    return errorResponse(
      error?.message || "Unable to load payment state",
      error?.status || 500
    );
  }
}
