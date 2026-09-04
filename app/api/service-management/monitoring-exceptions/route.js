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

function addHours(value, hours) {
  const date = value ? new Date(value) : new Date();
  const base = Number.isNaN(date.getTime()) ? new Date() : date;
  base.setUTCHours(base.getUTCHours() + Number(hours || 0));
  return base.toISOString();
}

async function currentException(context, pointId) {
  const data = await getMonitoringExceptions({ context });
  return data.rows.find((item) => item.point_id === pointId) || null;
}

function requireOperationsResult(result, fallback) {
  if (result?.status < 400 && result?.body?.ok) return result.body;
  const error = new Error(result?.body?.error || fallback);
  error.status = result?.status || 500;
  throw error;
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
    const pointId = text(body.pointId || body.point_id, 160);
    if (!pointId) return responseError("Monitoring point id is required.", 400);

    if (action === "create_corrective_action") {
      const row = await currentException(resolved.context, pointId);
      if (!row) return responseError("No active monitoring exception exists for this point.", 404);
      if (row.active_action) return Response.json({ success: true, action, corrective_action: row.active_action, existing: true });

      const dueAt = addHours(row.trigger_at || new Date().toISOString(), row.due_hours);
      const result = await serverOperationsApi.execute({
        capabilityId: "corrective-actions",
        command: "create",
        context: resolved.context,
        payload: {
          name: `${row.point_code} corrective action`,
          description: row.recommendation,
          priority: row.severity,
          due_at: dueAt,
          source_domain: "service-management",
          source_type: "monitoring-point",
          source_id: row.point_id,
          idempotency_key: text(body.clientMutationId || body.client_mutation_id, 160) || `monitoring-exception:${row.point_id}:${row.trigger_check_id}`,
          attributes: {
            monitoring_corrective_action: {
              schema_version: 2,
              point_id: row.point_id,
              point_code: row.point_code,
              trigger_check_id: row.trigger_check_id,
              trigger_at: row.trigger_at,
              signals: row.signals,
              severity: row.severity,
              recommendation: row.recommendation,
              customer_party_id: row.customer_party_id,
              customer_name: row.customer_name,
              customer_location_id: row.customer_location_id,
              customer_location_name: row.customer_location_name,
              area: row.area,
              placement: row.placement,
              due_at: dueAt,
              verification: null,
              created_from: "monitoring_exception",
            },
          },
        },
      });

      const resultBody = requireOperationsResult(result, "Corrective action creation failed.");
      return Response.json({ success: true, action, corrective_action: resultBody.execution?.result || null });
    }

    if (action === "create_follow_up_work") {
      const row = await currentException(resolved.context, pointId);
      if (!row?.active_action) return responseError("Create the corrective action before creating follow-up work.", 409);
      if (row.active_action.follow_up_work_order) {
        return Response.json({ success: true, action, work_order: row.active_action.follow_up_work_order, existing: true });
      }
      if (normalized(row.active_action.status) !== "in_progress") {
        return responseError("Start the corrective action before creating its follow-up work order.", 409);
      }

      const corrective = row.active_action.details || {};
      const dueAt = row.active_action.due_at || corrective.due_at || addHours(row.trigger_at, row.due_hours);
      const result = await serverOperationsApi.execute({
        capabilityId: "work-orders",
        command: "create",
        context: resolved.context,
        payload: {
          name: `${row.point_code} — monitoring follow-up`,
          description: corrective.recommendation || row.recommendation,
          priority: row.severity,
          due_at: dueAt,
          source_domain: "service-management",
          source_type: "monitoring-corrective-action",
          source_id: row.active_action.id,
          idempotency_key: text(body.clientMutationId || body.client_mutation_id, 160) || `monitoring-follow-up:${row.active_action.id}`,
          attributes: {
            monitoring_follow_up: {
              schema_version: 2,
              corrective_action_id: row.active_action.id,
              point_id: row.point_id,
              point_code: row.point_code,
              trigger_check_id: row.trigger_check_id,
              trigger_at: row.trigger_at,
              severity: row.severity,
              signals: row.signals,
              recommendation: row.recommendation,
              customer_party_id: row.customer_party_id,
              customer_name: row.customer_name,
              customer_location_id: row.customer_location_id,
              customer_location_name: row.customer_location_name,
              area: row.area,
              placement: row.placement,
              due_at: dueAt,
              created_from: "monitoring_corrective_action",
            },
          },
        },
      });

      const resultBody = requireOperationsResult(result, "Follow-up work creation failed.");
      return Response.json({ success: true, action, work_order: resultBody.execution?.result || null });
    }

    if (action === "verify_corrective_action") {
      const row = await currentException(resolved.context, pointId);
      const corrective = row?.active_action;
      if (!corrective) return responseError("No active corrective action exists for this monitoring point.", 404);
      if (!corrective.verification?.can_verify) {
        const state = corrective.verification?.state || "unknown";
        return responseError(`Corrective action is not ready for verification. Current verification state: ${state}.`, 409);
      }

      const detailResult = await serverOperationsApi.detail({
        capabilityId: "corrective-actions",
        id: corrective.id,
        context: resolved.context,
      });
      const detailBody = requireOperationsResult(detailResult, "Corrective action could not be loaded for verification.");
      const record = detailBody.record;
      if (!record) return responseError("Corrective action not found.", 404);
      if (normalized(record.status) !== "in_progress") {
        return responseError("Only an in-progress corrective action can be verified complete.", 409);
      }

      const check = corrective.verification.post_work_check;
      const workOrder = corrective.follow_up_work_order;
      const verifiedAt = new Date().toISOString();
      const existingAttributes = record.attributes || {};
      const existingCorrective = existingAttributes.monitoring_corrective_action || corrective.details || {};
      const result = await serverOperationsApi.execute({
        capabilityId: "corrective-actions",
        command: "complete",
        context: resolved.context,
        payload: {
          id: corrective.id,
          idempotency_key: text(body.clientMutationId || body.client_mutation_id, 160) || `monitoring-corrective-verify:${corrective.id}:${check.id}`,
          attributes: {
            ...existingAttributes,
            monitoring_corrective_action: {
              ...existingCorrective,
              schema_version: Math.max(2, Number(existingCorrective.schema_version || 1)),
              verification: {
                state: "verified",
                verified_at: verifiedAt,
                verified_by: resolved.context.actor_id || null,
                verified_check_id: check.id,
                verified_check_at: check.checked_at || check.created_at || null,
                verified_condition: check.condition || null,
                verified_activity_level: check.activity_level || null,
                verified_count: Number(check.count || 0),
                follow_up_work_order_id: workOrder?.id || null,
                follow_up_work_completed_at: corrective.verification.work_completed_at || null,
              },
            },
          },
        },
      });

      const resultBody = requireOperationsResult(result, "Corrective action verification failed.");
      return Response.json({
        success: true,
        action,
        corrective_action: resultBody.execution?.result || null,
        verified_check_id: check.id,
        verified_at: verifiedAt,
      });
    }

    return responseError("Unsupported monitoring exception action.", 400);
  } catch (error) {
    return responseError(error);
  }
}
