export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { resolveOperationsRequestContext } from "@/lib/operations/api/resolveOperationsRequestContext";
import { convertApprovedServiceFollowUpToWorkOrder } from "@/lib/operations/workforce/ServiceFollowUpConversionRuntime";

function responseError(error, status = 500) {
  return Response.json(
    { success: false, error: error?.message || error || "Service follow-up conversion failed." },
    { status: error?.status || status },
  );
}

export async function POST(request, { params }) {
  try {
    const resolvedParams = await params;
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

    const result = await convertApprovedServiceFollowUpToWorkOrder({
      context: resolved.context,
      workRequestId: resolvedParams?.id,
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    return responseError(error);
  }
}
