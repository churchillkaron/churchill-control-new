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
    const organizationId = readValue(body, "organizationId", "organization_id");
    const requestedApplicationId =
      body.applicationId ||
      body.application_id ||
      request.headers.get("x-pos-application");

    const resolved = await resolvePOSRequestApplication({
      request,
      organizationId,
      requestedApplicationId,
    });
    if (!resolved.success) {
      return errorResponse(resolved.error, resolved.status || 403);
    }

    const itemCorrections = resolved.application.adapter?.itemCorrections;
    if (typeof itemCorrections?.execute !== "function") {
      return errorResponse(
        `Item corrections are not available for application ${resolved.application.id}`,
        501
      );
    }

    const result = await itemCorrections.execute({
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
    console.error("POS ITEM CORRECTION ACTION ERROR", error);
    return errorResponse(
      error?.message || "POS item correction failed",
      error?.status || 500
    );
  }
}
