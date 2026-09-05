export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  resolveServiceManagementContext,
  searchParamsToServiceInput,
} from "@/lib/service-management/api/resolveServiceManagementContext";
import { updateServiceOccurrence } from "@/lib/service-management/repositories/ServicePlanRepository";
import {
  getServiceTreatmentCatalog,
  normalizeServicePestFindings,
  normalizeServiceTreatmentApplications,
} from "@/lib/service-management/runtime/ServiceTreatmentRuntime";
import { projectServiceTreatmentReadiness } from "@/lib/service-management/runtime/ServiceTreatmentReadinessRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TERMINAL_STATUSES = new Set(["complete", "completed", "cancelled", "canceled", "archived"]);
const STARTED_STATUSES = new Set(["start", "started", "in_progress"]);

function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function responseError(error, status = 500) {
  return Response.json(
    {
      success: false,
      error: error?.message || error || "Service treatment request failed.",
      treatment_readiness: error?.treatment_readiness || undefined,
    },
    { status: error?.status || status },
  );
}

async function loadOccurrence({ organizationId, occurrenceId }) {
  const result = await supabaseAdmin
    .from("service_plan_occurrences")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", occurrenceId)
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) {
    const error = new Error("Service occurrence not found in this organization.");
    error.status = 404;
    throw error;
  }
  return result.data;
}

async function loadWorkOrder({ organizationId, occurrence }) {
  if (!occurrence?.work_order_id) return null;
  const result = await supabaseAdmin
    .from("operations_records")
    .select("id,status,entity_id,attributes")
    .eq("organization_id", organizationId)
    .eq("capability_id", "work-orders")
    .eq("id", occurrence.work_order_id)
    .maybeSingle();

  if (result.error) throw result.error;
  const workOrder = result.data || null;
  if (
    workOrder
    && occurrence.entity_id
    && workOrder.entity_id
    && occurrence.entity_id !== workOrder.entity_id
  ) {
    const error = new Error("Service occurrence and work order entity scopes do not match.");
    error.status = 409;
    throw error;
  }
  return workOrder;
}

function executionState({ occurrence, workOrder }) {
  const occurrenceTerminal = TERMINAL_STATUSES.has(normalized(occurrence?.status));
  const workOrderTerminal = TERMINAL_STATUSES.has(normalized(workOrder?.status));
  const staffExecution = workOrder?.attributes?.staff_execution || {};
  const started = STARTED_STATUSES.has(normalized(workOrder?.status))
    || Boolean(staffExecution.started_at)
    || Boolean(staffExecution.started?.at);
  const terminal = occurrenceTerminal || workOrderTerminal;
  return {
    started,
    terminal,
    editable: started && !terminal,
    work_order_status: workOrder?.status || null,
    reason: terminal
      ? "Treatment is locked because this service is closed."
      : started
        ? "Treatment is open for this exact on-site occurrence."
        : "Confirm arrival in the technician workspace before recording treatment work.",
  };
}

async function projectTreatment({ occurrence, workOrder = null }) {
  const catalog = await getServiceTreatmentCatalog({
    organizationId: occurrence.organization_id,
    entityId: occurrence.entity_id || null,
  });
  const treatment = occurrence.attributes?.service_treatment || null;
  const readiness = projectServiceTreatmentReadiness(treatment, { applicable: true });
  return {
    success: true,
    occurrence: {
      id: occurrence.id,
      entity_id: occurrence.entity_id || null,
      service_plan_id: occurrence.service_plan_id || null,
      work_order_id: occurrence.work_order_id || null,
      status: occurrence.status || null,
      occurrence_at: occurrence.occurrence_at || null,
      completed_at: occurrence.completed_at || null,
      service_delivery: occurrence.attributes?.service_delivery || null,
    },
    execution: executionState({ occurrence, workOrder }),
    readiness,
    treatment,
    catalog,
  };
}

async function resolveOccurrence({ request, input }) {
  const resolved = await resolveServiceManagementContext({ request, input });
  if (!resolved.success) {
    const error = new Error(resolved.error || "Service context could not be resolved.");
    error.status = resolved.status || 403;
    throw error;
  }

  const occurrenceId = text(input.occurrence_id || input.occurrenceId);
  if (!occurrenceId) {
    const error = new Error("occurrence_id is required.");
    error.status = 400;
    throw error;
  }

  const occurrence = await loadOccurrence({
    organizationId: resolved.context.organization_id,
    occurrenceId,
  });
  if (
    resolved.context.entity_id
    && occurrence.entity_id
    && resolved.context.entity_id !== occurrence.entity_id
  ) {
    const error = new Error("Service occurrence does not belong to the active entity.");
    error.status = 403;
    throw error;
  }

  const workOrder = await loadWorkOrder({
    organizationId: resolved.context.organization_id,
    occurrence,
  });
  return { resolved, occurrence, workOrder };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const input = searchParamsToServiceInput(url.searchParams);
    const { occurrence, workOrder } = await resolveOccurrence({ request, input });
    return Response.json(await projectTreatment({ occurrence, workOrder }));
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { resolved, occurrence, workOrder } = await resolveOccurrence({ request, input: body });
    const execution = executionState({ occurrence, workOrder });

    if (execution.terminal) {
      return responseError("Completed or closed service treatment is immutable.", 409);
    }
    if (!execution.started) {
      return responseError("Confirm arrival before recording treatment work for this visit.", 409);
    }

    const pestFindings = normalizeServicePestFindings(body.pest_findings || body.pestFindings || []);
    const applications = await normalizeServiceTreatmentApplications({
      organizationId: resolved.context.organization_id,
      entityId: occurrence.entity_id || resolved.context.entity_id || null,
      applications: body.treatment_applications || body.treatmentApplications || [],
    });
    const shortage = applications.find((application) => application.stock_shortage);
    if (shortage) {
      return responseError(
        `Insufficient stock for ${shortage.material_name}. Projected stock would be ${shortage.projected_stock_after} ${shortage.unit || ""}.`.trim(),
        409,
      );
    }

    const now = new Date().toISOString();
    const previous = occurrence.attributes?.service_treatment || null;
    const candidate = {
      schema_version: 2,
      status: "draft",
      pest_findings: pestFindings,
      applications,
      finding_count: pestFindings.length,
      application_count: applications.length,
      captured_at: previous?.captured_at || now,
      updated_at: now,
      captured_by: previous?.captured_by || resolved.context.actor_id || null,
      updated_by: resolved.context.actor_id || null,
      inventory_authority: "supply-chain",
      stock_posting: "on-service-completion",
    };
    const readiness = projectServiceTreatmentReadiness(candidate, { applicable: true });
    const treatment = {
      ...candidate,
      status: readiness.ready ? "ready" : "draft",
      readiness,
    };

    const updated = await updateServiceOccurrence({
      organizationId: resolved.context.organization_id,
      occurrenceId: occurrence.id,
      values: {
        attributes: {
          ...(occurrence.attributes || {}),
          service_treatment: treatment,
        },
      },
    });

    return Response.json({
      ...(await projectTreatment({ occurrence: updated, workOrder })),
      saved: true,
    });
  } catch (error) {
    return responseError(error);
  }
}
