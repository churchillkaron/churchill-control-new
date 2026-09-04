export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  resolveServiceManagementContext,
  searchParamsToServiceInput,
} from "@/lib/service-management/api/resolveServiceManagementContext";
import { getServiceMonitoringRound } from "@/lib/service-management/runtime/ServiceMonitoringRoundRuntime";

function responseError(error, status = 500) {
  return Response.json(
    { success: false, error: error?.message || error || "Monitoring round could not be loaded." },
    { status: error?.status || status },
  );
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const input = searchParamsToServiceInput(url.searchParams);
    const resolved = await resolveServiceManagementContext({ request, input });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const occurrenceId = String(input.occurrenceId || input.occurrence_id || "").trim();
    if (!occurrenceId) return responseError("occurrence_id is required.", 400);

    const round = await getServiceMonitoringRound({
      context: resolved.context,
      occurrenceId,
    });
    return Response.json({ success: true, round });
  } catch (error) {
    return responseError(error);
  }
}
