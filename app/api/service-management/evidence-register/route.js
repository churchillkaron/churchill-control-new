export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  resolveServiceManagementContext,
  searchParamsToServiceInput,
} from "@/lib/service-management/api/resolveServiceManagementContext";
import { listServiceOccurrences } from "@/lib/service-management/repositories/ServicePlanRepository";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TERMINAL_OCCURRENCE_STATUSES = new Set(["completed", "cancelled", "canceled", "archived"]);
const ACTIVE_EVIDENCE_STATUSES = new Set(["recorded", "validated"]);

function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function responseError(error, status = 500) {
  return Response.json(
    { success: false, error: error?.message || error || "Completion evidence register could not be loaded." },
    { status: error?.status || status },
  );
}

function serviceDelivery(occurrence = {}, workOrder = {}) {
  return workOrder.attributes?.service_delivery || occurrence.attributes?.service_delivery || {};
}

function projection(occurrence, workOrder, latestEvidence = null) {
  const delivery = serviceDelivery(occurrence, workOrder);
  const persistedCompletion = occurrence.attributes?.completion || null;
  const completion = persistedCompletion || (latestEvidence ? {
    completion_evidence_id: latestEvidence.id,
    evidence_status: latestEvidence.status,
    evidence_pending_completion: true,
  } : null);

  return {
    occurrence_id: occurrence.id,
    service_plan_id: occurrence.service_plan_id || null,
    occurrence_status: occurrence.status || null,
    occurrence_at: occurrence.occurrence_at || null,
    original_scheduled_start: occurrence.original_scheduled_start || null,
    work_order_id: workOrder.id,
    work_order_status: workOrder.status || null,
    name: workOrder.name || null,
    description: workOrder.description || null,
    priority: workOrder.priority || null,
    assigned_to: workOrder.assigned_to || null,
    scheduled_start: workOrder.scheduled_start || null,
    scheduled_end: workOrder.scheduled_end || null,
    due_at: workOrder.due_at || null,
    customer_party_id: delivery.customer_party_id || null,
    customer_name: delivery.customer_name || null,
    customer_location_id: delivery.customer_location_id || null,
    customer_location_name: delivery.customer_location_name || null,
    service_name: delivery.service_name || workOrder.name || "Service",
    service_category: delivery.service_category || null,
    industry_key: delivery.industry_key || null,
    execution_protocol: delivery.execution_protocol || null,
    completion,
    latest_completion_evidence_id: latestEvidence?.id || null,
    latest_completion_evidence_status: latestEvidence?.status || null,
    latest_completion_evidence_captured_at:
      latestEvidence?.attributes?.service_completion_evidence?.captured_at
      || latestEvidence?.created_at
      || null,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const input = searchParamsToServiceInput(url.searchParams);
    const resolved = await resolveServiceManagementContext({ request, input });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const occurrences = await listServiceOccurrences({
      organizationId: resolved.context.organization_id,
      planId: input.plan_id || input.planId || null,
      from: input.from || null,
      to: input.to || null,
      status: input.status || null,
      limit: Math.min(Number(input.limit) || 250, 500),
    });

    const candidates = occurrences.filter((row) => row.work_order_id);
    const workOrderIds = [...new Set(candidates.map((row) => row.work_order_id).filter(Boolean))];

    let workOrders = [];
    if (workOrderIds.length) {
      let query = supabaseAdmin
        .from("operations_records")
        .select("*")
        .eq("organization_id", resolved.context.organization_id)
        .eq("capability_id", "work-orders")
        .in("id", workOrderIds);
      if (resolved.context.entity_id) {
        query = query.or(`entity_id.eq.${resolved.context.entity_id},entity_id.is.null`);
      }
      const result = await query;
      if (result.error) throw result.error;
      workOrders = result.data || [];
    }

    const visibleWorkOrderIds = new Set(workOrders.map((row) => row.id));
    const visibleOccurrences = candidates.filter((row) => visibleWorkOrderIds.has(row.work_order_id));
    const occurrenceIds = [...new Set(visibleOccurrences.map((row) => row.id).filter(Boolean))];

    let evidenceRows = [];
    if (occurrenceIds.length) {
      let query = supabaseAdmin
        .from("operations_records")
        .select("id,status,source_id,attributes,created_at")
        .eq("organization_id", resolved.context.organization_id)
        .eq("capability_id", "completion-evidence")
        .eq("source_domain", "service-management")
        .eq("source_type", "service-occurrence")
        .in("source_id", occurrenceIds)
        .in("status", [...ACTIVE_EVIDENCE_STATUSES])
        .order("created_at", { ascending: false });
      if (resolved.context.entity_id) {
        query = query.or(`entity_id.eq.${resolved.context.entity_id},entity_id.is.null`);
      }
      const result = await query;
      if (result.error) throw result.error;
      evidenceRows = result.data || [];
    }

    const workOrdersById = new Map(workOrders.map((row) => [row.id, row]));
    const evidenceByOccurrence = new Map();
    for (const evidence of evidenceRows) {
      if (!evidenceByOccurrence.has(evidence.source_id)) {
        evidenceByOccurrence.set(evidence.source_id, evidence);
      }
    }

    const rows = visibleOccurrences
      .map((occurrence) => {
        const workOrder = workOrdersById.get(occurrence.work_order_id);
        return workOrder
          ? projection(occurrence, workOrder, evidenceByOccurrence.get(occurrence.id) || null)
          : null;
      })
      .filter(Boolean)
      .sort(
        (left, right) =>
          new Date(left.scheduled_start || left.occurrence_at || 0)
          - new Date(right.scheduled_start || right.occurrence_at || 0),
      );

    return Response.json({
      success: true,
      count: rows.length,
      active_count: rows.filter(
        (row) => !TERMINAL_OCCURRENCE_STATUSES.has(normalized(row.occurrence_status)),
      ).length,
      rows,
    });
  } catch (error) {
    return responseError(error);
  }
}
