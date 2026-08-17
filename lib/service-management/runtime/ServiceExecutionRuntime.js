import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import {
  getExecutionReport,
  insertExecutionReport,
  updateExecutionReport,
} from "../repositories/ServiceExecutionReportRepository";
import { getServiceExecutionTemplate } from "../repositories/ServiceExecutionTemplateRepository";
import createServiceExecutionTemplateSnapshot from "./serviceExecutionTemplateSnapshot";

function cleanObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function cleanArray(value) {
  return Array.isArray(value) ? value : [];
}

function fieldList(snapshot = {}) {
  const schema = snapshot.field_schema;
  if (Array.isArray(schema)) return schema;
  return cleanArray(schema?.fields);
}

function evidenceRequirementList(snapshot = {}) {
  const requirements = snapshot.evidence_requirements;
  if (Array.isArray(requirements)) return requirements;
  return cleanArray(requirements?.requirements || requirements?.items);
}

function fieldKey(field = {}) {
  return String(field.id || field.key || field.name || "").trim();
}

function evidenceKey(item = {}) {
  return String(
    item.id || item.key || item.requirement_id || item.type || item.name || ""
  ).trim();
}

function hasValue(value) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function completionErrors({ report, snapshot }) {
  const responses = cleanObject(report.field_responses);
  const evidence = cleanArray(report.evidence);
  const rules = cleanObject(snapshot?.completion_rules);
  const errors = [];

  const requiredFields = new Set([
    ...fieldList(snapshot)
      .filter((field) => field?.required === true)
      .map(fieldKey)
      .filter(Boolean),
    ...cleanArray(rules.required_fields).map(String),
  ]);

  for (const key of requiredFields) {
    if (!hasValue(responses[key])) {
      errors.push(`Required field is incomplete: ${key}`);
    }
  }

  const requiredEvidence = new Set([
    ...evidenceRequirementList(snapshot)
      .filter((item) => item?.required === true)
      .map(evidenceKey)
      .filter(Boolean),
    ...cleanArray(rules.required_evidence).map(String),
  ]);

  for (const key of requiredEvidence) {
    const found = evidence.some((item) => {
      const values = [
        item?.requirement_id,
        item?.key,
        item?.type,
        item?.category,
        item?.name,
      ]
        .filter(Boolean)
        .map(String);
      return values.includes(key);
    });
    if (!found) errors.push(`Required evidence is missing: ${key}`);
  }

  if (
    rules.require_customer_acknowledgement === true &&
    !hasValue(report?.outcome?.customer_acknowledgement)
  ) {
    errors.push("Customer acknowledgement is required.");
  }

  return errors;
}

async function getAssignedWorkOrder({ organizationId, staffId, workOrderId }) {
  const result = await supabaseAdmin
    .from("operations_records")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("capability_id", "work-orders")
    .eq("id", workOrderId)
    .eq("assigned_to", staffId)
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) {
    const error = new Error("This work order is not assigned to you.");
    error.status = 404;
    throw error;
  }
  return result.data;
}

async function snapshotForWorkOrder({ organizationId, workOrder }) {
  const service = cleanObject(workOrder?.attributes?.service_delivery);
  if (service.execution_template_snapshot?.template_id) {
    return service.execution_template_snapshot;
  }

  const reference = String(service.execution_template_id || "").trim();
  if (!reference) return null;

  const template = await getServiceExecutionTemplate({
    organizationId,
    templateId: reference,
  });
  if (!template) {
    const error = new Error("The execution protocol for this job is unavailable.");
    error.status = 409;
    throw error;
  }

  return {
    ...createServiceExecutionTemplateSnapshot(template),
    legacy_pinned_at_start: true,
  };
}

export async function getOrCreateExecutionReportForStaff({
  organizationId,
  staffId,
  workOrderId,
  startGps = null,
}) {
  const workOrder = await getAssignedWorkOrder({
    organizationId,
    staffId,
    workOrderId,
  });

  const existing = await getExecutionReport({ organizationId, workOrderId });
  if (existing) {
    if (existing.staff_id !== staffId) {
      const error = new Error("This execution report belongs to another staff assignment.");
      error.status = 409;
      throw error;
    }
    return { workOrder, report: existing };
  }

  const service = cleanObject(workOrder?.attributes?.service_delivery);
  const snapshot = await snapshotForWorkOrder({ organizationId, workOrder });
  const report = await insertExecutionReport({
    values: {
      organization_id: organizationId,
      entity_id: workOrder.entity_id || null,
      work_order_id: workOrder.id,
      service_plan_occurrence_id:
        workOrder.source_type === "service-plan-occurrence"
          ? workOrder.source_id || null
          : null,
      staff_id: staffId,
      execution_template_id: snapshot?.template_id || null,
      execution_template_version: snapshot?.version || null,
      execution_template_snapshot: snapshot || {},
      field_responses: {},
      evidence: [],
      outcome: {},
      follow_up: {},
      start_gps: startGps || {},
      status: "in_progress",
      started_at: new Date().toISOString(),
    },
  });

  return {
    workOrder: {
      ...workOrder,
      attributes: {
        ...(workOrder.attributes || {}),
        service_delivery: {
          ...service,
          execution_template_id: snapshot?.template_id || referenceOrNull(service.execution_template_id),
          execution_template_version: snapshot?.version || null,
          execution_template_snapshot: snapshot,
        },
      },
    },
    report,
  };
}

function referenceOrNull(value) {
  const text = String(value || "").trim();
  return text || null;
}

export async function getExecutionForStaff({
  organizationId,
  staffId,
  workOrderId,
}) {
  const { workOrder, report } = await getOrCreateExecutionReportForStaff({
    organizationId,
    staffId,
    workOrderId,
  });

  return {
    workOrder,
    report,
    protocol: report.execution_template_snapshot || {},
  };
}

export async function saveExecutionForStaff({
  organizationId,
  staffId,
  workOrderId,
  input = {},
}) {
  const { report } = await getOrCreateExecutionReportForStaff({
    organizationId,
    staffId,
    workOrderId,
  });

  if (report.status === "completed") {
    const error = new Error("Completed service reports are immutable.");
    error.status = 409;
    throw error;
  }

  return updateExecutionReport({
    organizationId,
    workOrderId,
    staffId,
    values: {
      field_responses: {
        ...cleanObject(report.field_responses),
        ...cleanObject(input.field_responses || input.fieldResponses),
      },
      outcome: {
        ...cleanObject(report.outcome),
        ...cleanObject(input.outcome),
      },
      follow_up: {
        ...cleanObject(report.follow_up),
        ...cleanObject(input.follow_up || input.followUp),
      },
    },
  });
}

export async function appendExecutionEvidenceForStaff({
  organizationId,
  staffId,
  workOrderId,
  evidence,
}) {
  const { report } = await getOrCreateExecutionReportForStaff({
    organizationId,
    staffId,
    workOrderId,
  });

  if (report.status === "completed") {
    const error = new Error("Completed service reports are immutable.");
    error.status = 409;
    throw error;
  }

  return updateExecutionReport({
    organizationId,
    workOrderId,
    staffId,
    values: {
      evidence: [...cleanArray(report.evidence), evidence],
    },
  });
}

export async function completeExecutionForStaff({
  organizationId,
  staffId,
  actorId,
  workOrderId,
  completionGps,
  input = {},
}) {
  let report = await saveExecutionForStaff({
    organizationId,
    staffId,
    workOrderId,
    input,
  });
  const workOrder = await getAssignedWorkOrder({ organizationId, staffId, workOrderId });
  const errors = completionErrors({
    report,
    snapshot: report.execution_template_snapshot || {},
  });

  if (errors.length) {
    const error = new Error(errors.join(" "));
    error.status = 422;
    error.validationErrors = errors;
    throw error;
  }

  const operationsResponse = await serverOperationsApi.execute({
    capabilityId: "work-orders",
    command: "complete",
    context: {
      organization_id: organizationId,
      entity_id: workOrder.entity_id || null,
      period_id: workOrder.period_id || null,
      actor_id: actorId || null,
    },
    payload: {
      id: workOrderId,
      assigned_to: staffId,
      completed_at: new Date().toISOString(),
      attributes: {
        ...(workOrder.attributes || {}),
        service_execution_report_id: report.id,
      },
    },
  });

  if (operationsResponse.status >= 400 || !operationsResponse.body?.ok) {
    const error = new Error(
      operationsResponse.body?.error || "Unable to complete assigned work."
    );
    error.status = operationsResponse.status || 500;
    throw error;
  }

  report = await updateExecutionReport({
    organizationId,
    workOrderId,
    staffId,
    values: {
      completion_gps: completionGps || {},
      status: "completed",
      completed_at: new Date().toISOString(),
    },
  });

  return {
    report,
    workOrder: operationsResponse.body.execution?.result || workOrder,
  };
}

export default Object.freeze({
  getExecutionForStaff,
  getOrCreateExecutionReportForStaff,
  saveExecutionForStaff,
  appendExecutionEvidenceForStaff,
  completeExecutionForStaff,
});
