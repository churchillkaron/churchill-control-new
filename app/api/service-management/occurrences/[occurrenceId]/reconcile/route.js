export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { resolveServiceManagementContext } from "@/lib/service-management/api/resolveServiceManagementContext";
import { reconcileServiceOccurrence } from "@/lib/service-management/runtime/ServiceCompletionReconciliationRuntime";

function responseError(error, status = 500) {
  return Response.json(
    { success: false, error: error?.message || error || "Service occurrence reconciliation failed." },
    { status: error?.status || status },
  );
}

export async function POST(request, { params }) {
  try {
    const resolvedParams = await params;
    const occurrenceId = String(resolvedParams?.occurrenceId || "").trim();
    if (!occurrenceId) return responseError("occurrence_id is required.", 400);

    const body = await request.json().catch(() => ({}));
    const resolved = await resolveServiceManagementContext({ request, input: body });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const result = await reconcileServiceOccurrence({
      organizationId: resolved.context.organization_id,
      occurrenceId,
      actorId: resolved.context.actor_id,
      permissions: resolved.context.permissions,
    });

    return Response.json({ success: true, result });
  } catch (error) {
    return responseError(error);
  }
}
