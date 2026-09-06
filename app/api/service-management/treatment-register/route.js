export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  resolveServiceManagementContext,
  searchParamsToServiceInput,
} from "@/lib/service-management/api/resolveServiceManagementContext";
import { listServiceOccurrences } from "@/lib/service-management/repositories/ServicePlanRepository";
import { projectServiceTreatmentReadiness } from "@/lib/service-management/runtime/ServiceTreatmentReadinessRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TERMINAL_OCCURRENCE_STATUSES = new Set(["completed", "cancelled", "canceled", "archived"]);

function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function responseError(error, status = 500) {
  return Response.json(
    { success: false, error: error?.message || error || "Treatment register could not be loaded." },
    { status: error?.status || status },
  );
}

function serviceDelivery(occurrence = {}, workOrder = {}) {
  return workOrder.attributes?.service_delivery || occurrence.attributes?.service_delivery || {};
}

function treatmentProjection(occurrence, workOrder) {
  const delivery = serviceDelivery(occurrence, workOrder);
  const treatmentReadiness = projectServiceTreatmentReadiness(
    occurrence.attributes?.service_treatment || null,
    { applicable: normalized(delivery.industry_key) === "pest_control" },
  );

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
    assigned_to_name:
      workOrder.attributes?.assignee_name
      || workOrder.attributes?.assignment?.assignee_name
      || workOrder.attributes?.staff_execution?.technician_name
      || null,
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
    treatment_readiness: treatmentReadiness,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const input = searchParamsToServiceInput(url.searchParams);
    const resolved = await resolveServiceManagementContext({ request, input });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const rows = await listServiceOccurrences({
      organizationId: resolved.context.organization_id,
      planId: input.plan_id || input.planId || null,
      from: input.from || null,
      to: input.to || null,
      status: input.status || null,
      limit: Math.min(Number(input.limit) || 250, 500),
    });

    const candidateOccurrences = rows.filter((row) => row.work_order_id);
    const workOrderIds = [...new Set(candidateOccurrences.map((row) => row.work_order_id).filter(Boolean))];

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

    const byId = new Map(workOrders.map((row) => [row.id, row]));
    const projections = candidateOccurrences
      .map((occurrence) => {
        const workOrder = byId.get(occurrence.work_order_id);
        return workOrder ? treatmentProjection(occurrence, workOrder) : null;
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          new Date(a.scheduled_start || a.occurrence_at || 0)
          - new Date(b.scheduled_start || b.occurrence_at || 0),
      );

    return Response.json({
      success: true,
      count: projections.length,
      active_count: projections.filter(
        (row) => !TERMINAL_OCCURRENCE_STATUSES.has(normalized(row.occurrence_status)),
      ).length,
      rows: projections,
    });
  } catch (error) {
    return responseError(error);
  }
}
