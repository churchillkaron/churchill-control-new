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

    const bankDeposits = resolved.application.adapter?.bankDeposits;
    if (typeof bankDeposits?.load !== "function") {
      return errorResponse(
        `Bank deposits are not available for application ${resolved.application.id}`,
        501
      );
    }

    const result = await bankDeposits.load({
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
    console.error("POS BANK DEPOSIT LOAD ERROR", error);
    return errorResponse(
      error?.message || "Unable to load bank deposits",
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

    const bankDeposits = resolved.application.adapter?.bankDeposits;
    if (typeof bankDeposits?.execute !== "function") {
      return errorResponse(
        `Bank deposits are not available for application ${resolved.application.id}`,
        501
      );
    }

    const result = await bankDeposits.execute({
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
    console.error("POS BANK DEPOSIT ACTION ERROR", error);
    return errorResponse(
      error?.message || "Bank deposit submission failed",
      error?.status || 500
    );
  }
}
