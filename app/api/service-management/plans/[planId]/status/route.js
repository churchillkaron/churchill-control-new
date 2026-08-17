export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { resolveServiceManagementContext } from "@/lib/service-management/api/resolveServiceManagementContext";
import { setServicePlanStatus } from "@/lib/service-management/runtime/ServicePlanRuntime";

function responseError(error, status = 500) {
  return Response.json(
    { success: false, error: error?.message || error || "Service plan status update failed." },
    { status: error?.status || status },
  );
}

export async function POST(request, { params }) {
  try {
    const body = await request.json();
    const resolved = await resolveServiceManagementContext({ request, input: body });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const row = await setServicePlanStatus({
      context: resolved.context,
      planId: params.planId,
      status: String(body.status || "").trim().toLowerCase(),
    });

    return Response.json({ success: true, row });
  } catch (error) {
    return responseError(error);
  }
}
