export const dynamic = "force-dynamic";

import resolvePOSRequestApplication from "@/lib/operations/commerce/server/resolvePOSRequestApplication";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

function errorResponse(error, status = 500) {
  return Response.json({ success: false, error }, { status });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
      request: request,
    });

    if (!access.success) {
      return Response.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }
    const resolved = await resolvePOSRequestApplication({
      request,
      organizationId: access.organizationId,
      requestedApplicationId:
        searchParams.get("applicationId") ||
        searchParams.get("application_id") ||
        request.headers.get("x-pos-application"),
    });

    if (!resolved.success) {
      return errorResponse(resolved.error, resolved.status);
    }

    if (typeof resolved.application.adapter?.listPayableContexts !== "function") {
      return errorResponse(
        `Checkout contexts are not available for application ${resolved.application.id}`,
        501
      );
    }

    const contexts = await resolved.application.adapter.listPayableContexts({
      access: resolved.access,
      organization: resolved.organization,
      organizationId: resolved.organizationId,
      request,
    });

    return Response.json({
      success: true,
      application_id: resolved.application.id,
      contexts,
    });
  } catch (error) {
    console.error("POS PAYABLE CONTEXTS ERROR", error);
    return errorResponse(
      error?.message || "Unable to load payable contexts",
      error?.status || 500
    );
  }
}
