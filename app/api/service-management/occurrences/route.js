export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  resolveServiceManagementContext,
  searchParamsToServiceInput,
} from "@/lib/service-management/api/resolveServiceManagementContext";
import { getServicePlanOccurrences } from "@/lib/service-management/runtime/ServicePlanRuntime";

function responseError(error, status = 500) {
  return Response.json(
    { success: false, error: error?.message || error || "Service occurrence lookup failed." },
    { status: error?.status || status },
  );
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const input = searchParamsToServiceInput(url.searchParams);
    const resolved = await resolveServiceManagementContext({ request, input });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const rows = await getServicePlanOccurrences({ context: resolved.context, filters: input });
    return Response.json({ success: true, count: rows.length, rows });
  } catch (error) {
    return responseError(error);
  }
}
