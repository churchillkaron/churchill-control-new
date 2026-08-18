export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  resolveServiceManagementContext,
  searchParamsToServiceInput,
} from "@/lib/service-management/api/resolveServiceManagementContext";
import { getServiceReportDeliveryDraft } from "@/lib/service-management/runtime/ServiceReportDeliveryDraftRuntime";

function responseError(error, status = 500) {
  return Response.json(
    {
      success: false,
      error: error?.message || error || "Service delivery draft request failed.",
    },
    { status: error?.status || status },
  );
}

export async function GET(request, { params }) {
  try {
    const url = new URL(request.url);
    const input = searchParamsToServiceInput(url.searchParams);
    const resolved = await resolveServiceManagementContext({ request, input });
    if (!resolved.success) {
      return responseError(resolved.error, resolved.status || 403);
    }

    const occurrenceId = params?.occurrenceId;
    const draft = await getServiceReportDeliveryDraft({
      organizationId: resolved.context.organization_id,
      occurrenceId,
    });

    return Response.json({
      success: true,
      draft,
    });
  } catch (error) {
    return responseError(error);
  }
}
