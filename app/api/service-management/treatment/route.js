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
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TERMINAL_STATUSES = new Set(["completed", "cancelled", "canceled", "archived"]);

function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function responseError(error, status = 500) {
  return Response.json(
    { success: false, error: error?.message || error || "Service treatment request failed." },
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

async function projectTreatment({ occurrence }) {
  const catalog = await getServiceTreatmentCatalog({
    organizationId: occurrence.organization_id,
    entityId: occurrence.entity_id || null,
  });
  const treatment = occurrence.attributes?.service_treatment || null;
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
    treatment,
    catalog,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const input = searchParamsToServiceInput(url.searchParams);
    const resolved = await resolveServiceManagementContext({ request, input });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const occurrenceId = text(input.occurrence_id || input.occurrenceId);
    if (!occurrenceId) return responseError("occurrence_id is required.", 400);

    const occurrence = await loadOccurrence({
      organizationId: resolved.context.organization_id,
      occurrenceId,
    });
    if (
      resolved.context.entity_id
      && occurrence.entity_id
      && resolved.context.entity_id !== occurrence.entity_id
    ) {
      return responseError("Service occurrence does not belong to the active entity.", 403);
    }

    return Response.json(await projectTreatment({ occurrence }));
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const resolved = await resolveServiceManagementContext({ request, input: body });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const occurrenceId = text(body.occurrence_id || body.occurrenceId);
    if (!occurrenceId) return responseError("occurrence_id is required.", 400);

    const occurrence = await loadOccurrence({
      organizationId: resolved.context.organization_id,
      occurrenceId,
    });
    if (
      resolved.context.entity_id
      && occurrence.entity_id
      && resolved.context.entity_id !== occurrence.entity_id
    ) {
      return responseError("Service occurrence does not belong to the active entity.", 403);
    }
    if (TERMINAL_STATUSES.has(normalized(occurrence.status))) {
      return responseError("Completed or closed service treatment is immutable.", 409);
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
    const treatment = {
      schema_version: 1,
      status: "ready",
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
      ...(await projectTreatment({ occurrence: updated })),
      saved: true,
    });
  } catch (error) {
    return responseError(error);
  }
}
