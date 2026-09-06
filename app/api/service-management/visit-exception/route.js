export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  resolveServiceManagementContext,
  searchParamsToServiceInput,
} from "@/lib/service-management/api/resolveServiceManagementContext";
import {
  clearServiceVisitException,
  getServiceVisitExceptionState,
  recordServiceVisitException,
} from "@/lib/service-management/runtime/ServiceVisitExceptionRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function responseError(error, status = 500) {
  return Response.json({
    success: false,
    error: error?.message || error || "Service visit exception failed.",
    service_exception: error?.service_exception || undefined,
  }, { status: error?.status || status });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const input = searchParamsToServiceInput(url.searchParams);
    const resolved = await resolveServiceManagementContext({ request, input });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const occurrenceId = text(input.occurrence_id || input.occurrenceId);
    if (!occurrenceId) return responseError("occurrence_id is required.", 400);

    const serviceException = await getServiceVisitExceptionState({
      context: resolved.context,
      occurrenceId,
      workOrderId: text(input.work_order_id || input.workOrderId) || null,
    });

    return Response.json({ success: true, service_exception: serviceException });
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const resolved = await resolveServiceManagementContext({ request, input: body });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const occurrenceId = text(body.occurrenceId || body.occurrence_id);
    const workOrderId = text(body.workOrderId || body.work_order_id) || null;
    const action = normalized(body.action || "record");
    if (!occurrenceId) return responseError("occurrence_id is required.", 400);

    let serviceException;
    if (action === "record" || action === "save") {
      serviceException = await recordServiceVisitException({
        context: resolved.context,
        occurrenceId,
        workOrderId,
        outcome: body.outcome,
        severity: body.severity,
        nextAction: body.nextAction || body.next_action,
        summary: body.summary,
      });
    } else if (action === "clear") {
      serviceException = await clearServiceVisitException({
        context: resolved.context,
        occurrenceId,
        workOrderId,
      });
    } else {
      return responseError("Unsupported visit exception action.", 400);
    }

    return Response.json({ success: true, action, service_exception: serviceException });
  } catch (error) {
    return responseError(error);
  }
}