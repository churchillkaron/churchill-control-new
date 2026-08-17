export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  resolveServiceManagementContext,
  searchParamsToServiceInput,
} from "@/lib/service-management/api/resolveServiceManagementContext";
import {
  createServicePlan,
  getServicePlans,
} from "@/lib/service-management/runtime/ServicePlanRuntime";

function responseError(error, status = 500) {
  return Response.json(
    { success: false, error: error?.message || error || "Service Management request failed." },
    { status: error?.status || status },
  );
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const input = searchParamsToServiceInput(url.searchParams);
    const resolved = await resolveServiceManagementContext({ request, input });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const rows = await getServicePlans({ context: resolved.context, filters: input });
    return Response.json({
      success: true,
      organization_id: resolved.context.organization_id,
      count: rows.length,
      rows,
    });
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const resolved = await resolveServiceManagementContext({ request, input: body });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const row = await createServicePlan({ context: resolved.context, input: body });
    return Response.json({ success: true, row }, { status: 201 });
  } catch (error) {
    return responseError(error);
  }
}
