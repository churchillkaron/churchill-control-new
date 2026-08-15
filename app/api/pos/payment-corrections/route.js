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
    requestedApplicationId: requestedApplicationId || request.headers.get("x-pos-application"),
  });
}

export async function GET(request) {
  try {
    const resolved = await resolveRequest(request);
    if (!resolved.success) return errorResponse(resolved.error, resolved.status || 403);

    const paymentCorrections = resolved.application.adapter?.paymentCorrections;
    if (typeof paymentCorrections?.load !== "function") {
      return errorResponse(`Payment corrections are not available for application ${resolved.application.id}`, 501);
    }

    const result = await paymentCorrections.load({
      access: resolved.access,
      application: resolved.application,
      organization: resolved.organization,
      organizationId: resolved.organizationId,
      request,
      settings: resolved.settings,
    });

    return Response.json({ success: true, application_id: resolved.application.id, presentation: resolved.application.presentation || null, ...result });
  } catch (error) {
    console.error("POS PAYMENT CORRECTION LOAD ERROR", error);
    return errorResponse(error?.message || "Unable to load POS payment corrections", error?.status || 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const resolved = await resolveRequest(request, body);
    if (!resolved.success) return errorResponse(resolved.error, resolved.status || 403);

    const paymentCorrections = resolved.application.adapter?.paymentCorrections;
    if (typeof paymentCorrections?.execute !== "function") {
      return errorResponse(`Payment corrections are not available for application ${resolved.application.id}`, 501);
    }

    const result = await paymentCorrections.execute({
      body,
      access: resolved.access,
      application: resolved.application,
      organization: resolved.organization,
      organizationId: resolved.organizationId,
      request,
      settings: resolved.settings,
    });

    return Response.json({ success: true, application_id: resolved.application.id, presentation: resolved.application.presentation || null, ...result });
  } catch (error) {
    console.error("POS PAYMENT CORRECTION ACTION ERROR", error);
    return errorResponse(error?.message || "POS payment correction failed", error?.status || 500);
  }
}
