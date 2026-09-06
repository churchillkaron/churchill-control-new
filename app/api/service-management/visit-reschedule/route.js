export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  resolveServiceManagementContext,
} from "@/lib/service-management/api/resolveServiceManagementContext";
import { authorizeOperationsAccess } from "@/lib/operations/security/OperationsAuthorizationPolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) {
  return String(value ?? "").trim();
}

function isoDate(value, label) {
  const parsed = new Date(value || "");
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error(`${label} is required.`);
    error.status = 400;
    throw error;
  }
  return parsed.toISOString();
}

function responseError(error, status = 500) {
  return Response.json({
    success: false,
    error: error?.message || error || "Service visit could not be rescheduled.",
  }, { status: error?.status || status });
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const resolved = await resolveServiceManagementContext({ request, input: body });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const authorization = authorizeOperationsAccess({
      permissions: resolved.context.permissions,
      capabilityId: "work-orders",
      command: "reschedule",
    });
    if (!authorization.allowed) {
      return responseError("You do not have permission to reschedule service visits.", 403);
    }

    const occurrenceId = text(body.occurrenceId || body.occurrence_id);
    const reason = text(body.reason);
    const idempotencyKey = text(
      request.headers.get("Idempotency-Key")
      || body.idempotencyKey
      || body.idempotency_key,
    );

    if (!occurrenceId) return responseError("Service visit is required.", 400);
    if (!reason) return responseError("Tell us why the visit is moving.", 400);
    if (!idempotencyKey) return responseError("A request identity is required.", 400);

    const scheduledStart = isoDate(body.scheduledStart || body.scheduled_start, "New arrival time");
    const scheduledEnd = isoDate(body.scheduledEnd || body.scheduled_end, "New end time");
    if (new Date(scheduledEnd).getTime() <= new Date(scheduledStart).getTime()) {
      return responseError("The visit end must be after the arrival time.", 400);
    }

    const { data, error } = await supabaseAdmin.rpc("reschedule_service_visit_atomic", {
      p_organization_id: resolved.context.organization_id,
      p_occurrence_id: occurrenceId,
      p_scheduled_start: scheduledStart,
      p_scheduled_end: scheduledEnd,
      p_reason: reason,
      p_actor_id: resolved.context.actor_id || null,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      const rpcError = new Error(error.message || "Service visit could not be rescheduled.");
      rpcError.status = /cannot be rescheduled|only generated|not found|lineage|scope|unsupported/i.test(rpcError.message) ? 409 : 500;
      throw rpcError;
    }

    return Response.json({
      success: true,
      idempotent_replay: Boolean(data?.idempotent_replay),
      visit: {
        occurrence_id: data?.result?.occurrence?.id || occurrenceId,
        work_order_id: data?.result?.work_order?.id || null,
        scheduled_start: data?.result?.work_order?.scheduled_start || scheduledStart,
        scheduled_end: data?.result?.work_order?.scheduled_end || scheduledEnd,
        reason: data?.result?.change?.reason || reason,
        rescheduled_at: data?.result?.change?.rescheduled_at || null,
      },
    });
  } catch (error) {
    return responseError(error);
  }
}
