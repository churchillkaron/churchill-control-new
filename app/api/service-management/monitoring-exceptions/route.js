export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import { resolveServiceManagementContext, searchParamsToServiceInput } from "@/lib/service-management/api/resolveServiceManagementContext";
import { getMonitoringExceptions } from "@/lib/service-management/runtime/ServiceMonitoringExceptionRuntime";

function text(value, max = 500) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, max) : "";
}

function normalized(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function responseError(error, status = 500) {
  return Response.json({ success: false, error: error?.message || error || "Monitoring exceptions failed." }, { status: error?.status || status });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const input = searchParamsToServiceInput(url.searchParams);
    const resolved = await resolveServiceManagementContext({ request, input });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);
    const data = await getMonitoringExceptions({ context: resolved.context });
    return Response.json({ success: true, ...data });
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const resolved = await resolveServiceManagementContext({ request, input: body });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const action = normalized(body.action);
    if (action !== "create_corrective_action") return responseError("Unsupported monitoring exception action.", 400);

    const pointId = text(body.pointId || body.point_id, 160);
    const exception = await getMonitoringExceptions({ context: resolved.context });
    const row = exception.rows.find((item) => item.point_id === pointId);
    if (!row) return responseError("No active monitoring exception exists for this point.", 404);
    if (row.active_action) return Response.json({ success: true, action, corrective_action: row.active_action, existing: true });

    const result = await serverOperationsApi.execute({
      capabilityId: "corrective-actions",
      command: "create",
      context: resolved.context,
      payload: {
        name: `${row.point_code} corrective action`,
        description: row.recommendation,
        priority: row.severity,
        source_domain: "service-management",
        source_type: "monitoring-point",
        source_id: row.point_id,
        idempotency_key: text(body.clientMutationId || body.client_mutation_id, 160) || `monitoring-exception:${row.point_id}:${row.trigger_check_id}`,
        attributes: {
          monitoring_corrective_action: {
            schema_version: 1,
            point_id: row.point_id,
            point_code: row.point_code,
            trigger_check_id: row.trigger_check_id,
            trigger_at: row.trigger_at,
            signals: row.signals,
            severity: row.severity,
            recommendation: row.recommendation,
            created_from: "monitoring_exception",
          },
        },
      },
    });

    if (result.status >= 400 || !result.body?.ok) return responseError(result.body?.error || "Corrective action creation failed.", result.status || 500);

    return Response.json({ success: true, action, corrective_action: result.body.execution?.result || null });
  } catch (error) {
    return responseError(error);
  }
}
