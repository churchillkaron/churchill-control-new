export const dynamic = "force-dynamic";

import resolvePOSRequestApplication from "@/lib/operations/commerce/server/resolvePOSRequestApplication";

function readValue(source, camelKey, snakeKey) {
  return source?.[camelKey] ?? source?.[snakeKey] ?? null;
}

function errorResponse(error, status = 500) {
  return Response.json({ success: false, error }, { status });
}

async function resolveRequest(request, body = null) {
  const organizationId = body
    ? readValue(body, "organizationId", "organization_id")
    : (() => {
        const { searchParams } = new URL(request.url);
        return searchParams.get("organizationId") || searchParams.get("organization_id");
      })();
  const requestedApplicationId = body
    ? body.applicationId || body.application_id
    : (() => {
        const { searchParams } = new URL(request.url);
        return searchParams.get("applicationId") || searchParams.get("application_id");
      })();

  return resolvePOSRequestApplication({
    request,
    organizationId,
    requestedApplicationId:
      requestedApplicationId || request.headers.get("x-pos-application"),
  });
}

export async function GET(request) {
  try {
    const resolved = await resolveRequest(request);
    if (!resolved.success) {
      return errorResponse(resolved.error, resolved.status || 403);
    }

    const cashMovements = resolved.application.adapter?.cashMovements;
    if (typeof cashMovements?.load !== "function") {
      return errorResponse(
        `Cash movements are not available for application ${resolved.application.id}`,
        501
      );
    }

    const result = await cashMovements.load({
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
    console.error("POS CASH MOVEMENT LOAD ERROR", error);
    return errorResponse(
      error?.message || "Unable to load POS cash movements",
      error?.status || 500
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const resolved = await resolveRequest(request, body);
    if (!resolved.success) {
      return errorResponse(resolved.error, resolved.status || 403);
    }

    const cashMovements = resolved.application.adapter?.cashMovements;
    if (typeof cashMovements?.execute !== "function") {
      return errorResponse(
        `Cash movements are not available for application ${resolved.application.id}`,
        501
      );
    }

    const result = await cashMovements.execute({
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
    console.error("POS CASH MOVEMENT ACTION ERROR", error);
    return errorResponse(
      error?.message || "POS cash movement failed",
      error?.status || 500
    );
  }
}
