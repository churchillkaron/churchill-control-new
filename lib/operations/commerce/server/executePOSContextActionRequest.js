import resolvePOSRequestApplication from "@/lib/operations/commerce/server/resolvePOSRequestApplication";

function readValue(source, camelKey, snakeKey) {
  return source?.[camelKey] ?? source?.[snakeKey] ?? null;
}

function errorResponse(error, status = 500) {
  return Response.json({ success: false, error }, { status });
}

export async function executePOSContextActionRequest(request, options = {}) {
  try {
    const body = await request.json();
    const payload =
      body.payload && typeof body.payload === "object" ? body.payload : body;
    const action = options.action || body.action || payload.action;
    const organizationId =
      readValue(body, "organizationId", "organization_id") ||
      readValue(payload, "organizationId", "organization_id");
    const resolved = await resolvePOSRequestApplication({
      request,
      organizationId,
      requestedApplicationId:
        body.applicationId ||
        body.application_id ||
        options.applicationId ||
        request.headers.get("x-pos-application"),
    });

    if (!resolved.success) {
      return errorResponse(resolved.error, resolved.status || 403);
    }

    const executeAction = resolved.application.adapter?.contextActions?.execute;
    if (typeof executeAction !== "function") {
      return errorResponse(
        `POS context actions are not available for application ${resolved.application.id}`,
        501
      );
    }

    const execution = await executeAction({
      action,
      access: resolved.access,
      application: resolved.application,
      compatibilityRoute: options.compatibilityRoute || null,
      organization: resolved.organization,
      organizationId: resolved.organizationId,
      payload,
      request,
      settings: resolved.settings,
    });

    return Response.json({
      success: true,
      application_id: resolved.application.id,
      data: execution.result || null,
      execution: execution.execution || null,
      ...(execution.result || {}),
    });
  } catch (error) {
    console.error("POS CONTEXT ACTION ERROR", error);
    return errorResponse(
      error?.message || "POS context action failed",
      error?.status || 500
    );
  }
}

export default executePOSContextActionRequest;
