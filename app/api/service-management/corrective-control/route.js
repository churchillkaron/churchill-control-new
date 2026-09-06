export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  resolveServiceManagementContext,
  searchParamsToServiceInput,
} from "@/lib/service-management/api/resolveServiceManagementContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const SLA_HOURS = Object.freeze({ critical: 4, high: 24, medium: 72, low: 168 });
const TERMINAL_WORK = new Set(["complete", "completed", "cancelled", "canceled", "archived"]);

function normalized(value) { return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_"); }
function text(value) { return String(value ?? "").trim() || null; }
function severityFor(followUp = {}) {
  const explicit = normalized(followUp.protocol_submission?.service_exception?.severity);
  if (SLA_HOURS[explicit]) return explicit;
  return normalized(followUp.outcome) === "issue_found" ? "high" : "medium";
}
function dueAtFor(requestedAt, severity) {
  const date = new Date(requestedAt || "");
  if (Number.isNaN(date.getTime())) return null;
  date.setTime(date.getTime() + (SLA_HOURS[severity] || SLA_HOURS.medium) * 60 * 60 * 1000);
  return date.toISOString();
}
function stageFor({ request, workOrder, resolution }) {
  if (resolution?.status === "resolved") return "resolved";
  const requestStatus = normalized(request.status);
  if (requestStatus !== "approved") return requestStatus === "submitted" ? "needs_approval" : "needs_review";
  if (!workOrder) return "ready_for_corrective_visit";
  const status = normalized(workOrder.status);
  if (TERMINAL_WORK.has(status)) return "completed_pending_resolution";
  if (status === "in_progress" || status === "started") return "corrective_in_progress";
  if (status === "released") return "released_to_technician";
  if (status === "assigned") return "assigned";
  return "needs_assignment";
}

function responseError(error, status = 500) {
  return Response.json({ success: false, error: error?.message || error || "Corrective service control could not be loaded." }, { status: error?.status || status });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const input = searchParamsToServiceInput(url.searchParams);
    const resolved = await resolveServiceManagementContext({ request, input });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);
    const organizationId = resolved.context.organization_id;

    let requestQuery = supabaseAdmin
      .from("operations_records")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("capability_id", "work-requests")
      .eq("source_domain", "service-management")
      .eq("source_type", "service-follow-up")
      .order("created_at", { ascending: false })
      .limit(Math.min(Number(input.limit) || 500, 1000));
    if (resolved.context.entity_id) requestQuery = requestQuery.or(`entity_id.eq.${resolved.context.entity_id},entity_id.is.null`);
    const requestResult = await requestQuery;
    if (requestResult.error) throw requestResult.error;
    const requests = requestResult.data || [];
    const requestIds = requests.map((row) => row.id).filter(Boolean);

    let workOrders = [];
    if (requestIds.length) {
      let workQuery = supabaseAdmin
        .from("operations_records")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("capability_id", "work-orders")
        .eq("source_domain", "service-management")
        .eq("source_type", "service-follow-up-work-request")
        .in("source_id", requestIds)
        .order("created_at", { ascending: false });
      if (resolved.context.entity_id) workQuery = workQuery.or(`entity_id.eq.${resolved.context.entity_id},entity_id.is.null`);
      const workResult = await workQuery;
      if (workResult.error) throw workResult.error;
      workOrders = workResult.data || [];
    }

    const occurrenceIds = requests.map((row) => row.attributes?.service_follow_up?.occurrence_id).filter(Boolean);
    let originals = [];
    if (occurrenceIds.length) {
      let occurrenceQuery = supabaseAdmin
        .from("service_plan_occurrences")
        .select("id,organization_id,entity_id,status,completed_at,attributes")
        .eq("organization_id", organizationId)
        .in("id", [...new Set(occurrenceIds)]);
      if (resolved.context.entity_id) occurrenceQuery = occurrenceQuery.or(`entity_id.eq.${resolved.context.entity_id},entity_id.is.null`);
      const occurrenceResult = await occurrenceQuery;
      if (occurrenceResult.error) throw occurrenceResult.error;
      originals = occurrenceResult.data || [];
    }

    const workByRequest = new Map();
    for (const row of workOrders) if (!workByRequest.has(row.source_id)) workByRequest.set(row.source_id, row);
    const originalById = new Map(originals.map((row) => [row.id, row]));
    const now = Date.now();

    const rows = requests.map((requestRow) => {
      const followUp = requestRow.attributes?.service_follow_up || {};
      const workOrder = workByRequest.get(requestRow.id) || null;
      const original = originalById.get(followUp.occurrence_id) || null;
      const resolution = original?.attributes?.completion?.follow_up_resolution || null;
      const matchingResolution = resolution?.work_request_id === requestRow.id ? resolution : null;
      const severity = severityFor(followUp);
      const requestedAt = followUp.requested_at || requestRow.created_at;
      const slaDueAt = dueAtFor(requestedAt, severity);
      const stage = stageFor({ request: requestRow, workOrder, resolution: matchingResolution });
      const overdue = stage !== "resolved" && slaDueAt ? new Date(slaDueAt).getTime() < now : false;
      const serviceException = followUp.protocol_submission?.service_exception || null;
      return {
        work_request_id: requestRow.id,
        work_request_status: requestRow.status,
        allowed_commands: requestRow.allowed_commands || [],
        stage,
        severity,
        requested_at: requestedAt,
        sla_due_at: slaDueAt,
        overdue,
        customer_name: followUp.customer_name || null,
        customer_location_name: followUp.customer_location_name || null,
        service_name: followUp.service_name || requestRow.name || "Service follow-up",
        outcome: followUp.outcome || null,
        next_action: serviceException?.next_action || null,
        summary: serviceException?.summary || followUp.notes || requestRow.description || null,
        originating_occurrence_id: followUp.occurrence_id || null,
        originating_work_order_id: followUp.originating_work_order_id || null,
        completion_evidence_id: followUp.completion_evidence_id || null,
        corrective_work_order_id: workOrder?.id || null,
        corrective_work_order_status: workOrder?.status || null,
        corrective_assigned_to: workOrder?.assigned_to || null,
        corrective_scheduled_start: workOrder?.scheduled_start || null,
        corrective_scheduled_end: workOrder?.scheduled_end || null,
        corrective_occurrence_id: workOrder?.attributes?.service_delivery?.corrective_occurrence_id || matchingResolution?.corrective_occurrence_id || null,
        resolved_at: matchingResolution?.resolved_at || null,
        resolution: matchingResolution,
      };
    });

    const counts = {
      total: rows.length,
      open: rows.filter((row) => row.stage !== "resolved").length,
      overdue: rows.filter((row) => row.overdue).length,
      critical: rows.filter((row) => row.stage !== "resolved" && row.severity === "critical").length,
      needs_approval: rows.filter((row) => row.stage === "needs_approval" || row.stage === "needs_review").length,
      ready_for_corrective_visit: rows.filter((row) => row.stage === "ready_for_corrective_visit").length,
      in_field: rows.filter((row) => ["assigned", "released_to_technician", "corrective_in_progress", "needs_assignment"].includes(row.stage)).length,
      resolved: rows.filter((row) => row.stage === "resolved").length,
    };

    return Response.json({ success: true, counts, rows });
  } catch (error) {
    return responseError(error);
  }
}