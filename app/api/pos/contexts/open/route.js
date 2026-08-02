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
      return errorResponse(resolved.error, resolved.status || 403);
    }

    const openContext = resolved.application.adapter?.contexts?.openContext;
    if (typeof openContext !== "function") {
      return errorResponse(
        `POS contexts are not available for application ${resolved.application.id}`,
        501
      );
    }

    const result = await openContext({
      body,
      access: resolved.access,
      application: resolved.application,
      organization: resolved.organization,
      organizationId: resolved.organizationId,
      request,
      settings: resolved.settings,
    });

    return Response.json({
      success: true,
      application_id: resolved.application.id,
      presentation: resolved.application.presentation || null,
      ...result,
    });
  } catch (error) {
    console.error("OPEN POS CONTEXT ERROR", error);
    return errorResponse(
      error?.message || "Unable to open POS context",
      error?.status || 500
    );
  }
}
