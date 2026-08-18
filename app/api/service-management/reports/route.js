export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  resolveServiceManagementContext,
  searchParamsToServiceInput,
} from "@/lib/service-management/api/resolveServiceManagementContext";
import { listServiceOccurrences } from "@/lib/service-management/repositories/ServicePlanRepository";
import { getCompletedServiceReport } from "@/lib/service-management/runtime/ServiceCompletionReportRuntime";

function responseError(error, status = 500) {
  return Response.json(
    {
      success: false,
      error: error?.message || error || "Completed service report lookup failed.",
    },
    { status: error?.status || status },
  );
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const input = searchParamsToServiceInput(url.searchParams);
    const resolved = await resolveServiceManagementContext({ request, input });
    if (!resolved.success) {
      return responseError(resolved.error, resolved.status || 403);
    }

    const limit = Math.max(1, Math.min(Number(input.limit) || 100, 250));
    const occurrences = await listServiceOccurrences({
      organizationId: resolved.context.organization_id,
      planId: input.planId || input.plan_id || null,
      from: input.from || null,
      to: input.to || null,
      status: "completed",
      limit,
    });

    const reports = await Promise.all(
      occurrences.map((occurrence) =>
        getCompletedServiceReport({
          organizationId: resolved.context.organization_id,
          occurrenceId: occurrence.id,
        }),
      ),
    );

    const rows = reports.sort((left, right) => {
      const leftTime = new Date(left.service?.completed_at || left.service?.scheduled_at || 0).getTime();
      const rightTime = new Date(right.service?.completed_at || right.service?.scheduled_at || 0).getTime();
      return rightTime - leftTime;
    });

    return Response.json({
      success: true,
      organization_id: resolved.context.organization_id,
      count: rows.length,
      rows,
      summary: {
        completed: rows.length,
        ready_to_invoice: rows.filter((row) => row.billing?.eligible).length,
        invoiced: rows.filter((row) => row.billing?.invoice?.invoice_id).length,
        prepaid: rows.filter((row) => row.billing?.prepaid).length,
        follow_up_required: rows.filter((row) => row.service?.follow_up_required).length,
      },
    });
  } catch (error) {
    return responseError(error);
  }
}
