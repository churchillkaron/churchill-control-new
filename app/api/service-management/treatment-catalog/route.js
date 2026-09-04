export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  resolveServiceManagementContext,
  searchParamsToServiceInput,
} from "@/lib/service-management/api/resolveServiceManagementContext";
import { getServiceTreatmentCatalog } from "@/lib/service-management/runtime/ServiceTreatmentRuntime";

function responseError(error, status = 500) {
  return Response.json(
    { success: false, error: error?.message || error || "Treatment catalog request failed." },
    { status: error?.status || status },
  );
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const input = searchParamsToServiceInput(url.searchParams);
    const resolved = await resolveServiceManagementContext({ request, input });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const catalog = await getServiceTreatmentCatalog({
      organizationId: resolved.context.organization_id,
      entityId: resolved.context.entity_id || null,
    });

    return Response.json({ success: true, ...catalog });
  } catch (error) {
    return responseError(error);
  }
}
