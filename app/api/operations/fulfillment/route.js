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
      organizationId: searchParams.get("organizationId"),
      requestedApplicationId:
        searchParams.get("applicationId") ||
        request.headers.get("x-pos-application"),
    });

    if (!resolved.success) {
      return errorResponse(resolved.error, resolved.status);
    }

    const fulfillment = resolved.application.adapter?.fulfillment;
    if (typeof fulfillment?.listQueue !== "function") {
      return errorResponse(
        `Fulfillment queues are not available for application ${resolved.application.id}`,
        501
      );
    }

    const result = await fulfillment.listQueue({
      access: resolved.access,
      application: resolved.application,
      organization: resolved.organization,
      organizationId: resolved.organizationId,
      scope: searchParams.get("scope") || "active",
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("FULFILLMENT QUEUE ERROR", error);
    return errorResponse(
      error?.message || "Unable to load fulfillment queue",
      error?.status || 500
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const resolved = await resolvePOSRequestApplication({
      request,
      organizationId: body.organizationId || body.organization_id,
      requestedApplicationId:
        body.applicationId ||
        body.application_id ||
        request.headers.get("x-pos-application"),
    });

    if (!resolved.success) {
      return errorResponse(resolved.error, resolved.status);
    }

    const fulfillment = resolved.application.adapter?.fulfillment;
    if (typeof fulfillment?.transitionWorkItem !== "function") {
      return errorResponse(
        `Fulfillment transitions are not available for application ${resolved.application.id}`,
        501
      );
    }

    const result = await fulfillment.transitionWorkItem({
      body,
      access: resolved.access,
      application: resolved.application,
      organization: resolved.organization,
      organizationId: resolved.organizationId,
      request,
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("FULFILLMENT TRANSITION ERROR", error);
    return errorResponse(
      error?.message || "Fulfillment transition failed",
      error?.status || 500
    );
  }
}
