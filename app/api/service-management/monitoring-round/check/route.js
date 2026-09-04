export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import {
  resolveServiceManagementContext,
} from "@/lib/service-management/api/resolveServiceManagementContext";
import { assertMonitoringPointVisitBinding } from "@/lib/service-management/runtime/ServiceMonitoringRoundRuntime";

const CONDITIONS = new Set(["good", "damaged", "missing", "blocked", "contaminated", "replacement_required"]);
const ACTIVITY_LEVELS = new Set(["none", "low", "medium", "high", "critical"]);
const ACTIONS = new Set(["inspected", "cleaned", "rebaited", "reset", "repaired", "replaced", "removed"]);

function text(value, max = 500) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, max) : "";
}

function normalized(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function boundedNumber(value, min, max, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return fallback;
  return number;
}

function dateValue(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function monitoringPoint(record = {}) {
  return record.attributes?.monitoring_point || null;
}

function responseError(error, status = 500) {
  return Response.json(
    { success: false, error: error?.message || error || "Monitoring check could not be recorded." },
    { status: error?.status || status },
  );
}

function requireOperationsResult(result, fallback) {
  if (result?.status < 400 && result?.body?.ok) return result.body;
  const error = new Error(result?.body?.error || fallback);
  error.status = result?.status || 500;
  throw error;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const resolved = await resolveServiceManagementContext({ request, input: body });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);
    const context = resolved.context;

    const occurrenceId = text(body.occurrenceId || body.occurrence_id, 160);
    const pointId = text(body.pointId || body.point_id, 160);
    if (!occurrenceId) return responseError("occurrence_id is required.", 400);
    if (!pointId) return responseError("monitoring point id is required.", 400);

    const detail = await serverOperationsApi.detail({
      capabilityId: "equipment",
      id: pointId,
      context,
    });
    const record = requireOperationsResult(detail, "Monitoring point not found.").record;
    const point = monitoringPoint(record);
    if (!point || point.industry_key !== "pest-control") {
      return responseError("This equipment record is not a Pest Control monitoring point.", 409);
    }
    if (normalized(record.status) !== "active") {
      return responseError("Only active monitoring points can receive new checks.", 409);
    }

    const visit = await assertMonitoringPointVisitBinding({
      context,
      occurrenceId,
      point,
    });

    const condition = normalized(body.condition || "good");
    const activityLevel = normalized(body.activityLevel || body.activity_level || "none");
    const actionTaken = normalized(body.actionTaken || body.action_taken || "inspected");
    if (!CONDITIONS.has(condition)) return responseError("Unsupported monitoring point condition.", 400);
    if (!ACTIVITY_LEVELS.has(activityLevel)) return responseError("Unsupported pest activity level.", 400);
    if (!ACTIONS.has(actionTaken)) return responseError("Unsupported monitoring point service action.", 400);

    const checkedAt = dateValue(body.checkedAt || body.checked_at)?.toISOString() || new Date().toISOString();
    const count = boundedNumber(body.count, 0, 100000, 0);
    const check = {
      schema_version: 2,
      monitoring_point_id: record.id,
      monitoring_point_code: point.code,
      occurrence_id: visit.occurrence_id,
      work_order_id: visit.work_order_id,
      service_plan_id: visit.service_plan_id,
      customer_party_id: visit.customer_party_id || point.customer_party_id || null,
      customer_location_id: visit.customer_location_id,
      customer_location_name: point.customer_location_name || null,
      checked_at: checkedAt,
      condition,
      activity_level: activityLevel,
      pest_name: text(body.pestName || body.pest_name, 120) || null,
      count,
      action_taken: actionTaken,
      notes: text(body.notes, 1200) || null,
      technician_id: context.actor_id || null,
    };
    const mutationId = text(body.clientMutationId || body.client_mutation_id, 160) || `${Date.now()}`;
    const result = await serverOperationsApi.execute({
      capabilityId: "activities",
      command: "record",
      context,
      payload: {
        name: `${point.code} monitoring check`,
        description: `${condition} · ${activityLevel} activity · ${actionTaken}`,
        source_domain: "service-management",
        source_type: "monitoring-point-check",
        source_id: record.id,
        idempotency_key: `monitoring-check:${record.id}:${visit.occurrence_id}:${mutationId}`,
        attributes: { monitoring_point_check: check },
      },
    });
    const activity = requireOperationsResult(result, "Unable to record monitoring point check.").execution?.result;
    return Response.json({ success: true, activity, visit_binding: visit });
  } catch (error) {
    return responseError(error);
  }
}
