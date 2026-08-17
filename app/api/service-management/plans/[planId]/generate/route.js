export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { resolveOperationsRequestContext } from "@/lib/operations/api/resolveOperationsRequestContext";
import { generateNextServiceVisit } from "@/lib/service-management/runtime/ServicePlanRuntime";

function responseError(error, status = 500) {
  return Response.json(
    { success: false, error: error?.message || error || "Service visit generation failed." },
    { status: error?.status || status },
  );
}

export async function POST(request, { params }) {
  try {
    const body = await request.json().catch(() => ({}));
    const resolved = await resolveOperationsRequestContext({
      request,
      input: body,
      capabilityId: "work-orders",
      command: "create",
      authorize: true,
    });

    if (!resolved.success) {
      return responseError(resolved.error, resolved.status || 403);
    }

    const result = await generateNextServiceVisit({
      context: resolved.context,
      planId: params.planId,
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    return responseError(error);
  }
}
