import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value, max = 500) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, max) : "";
}

function normalized(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function requireContext(context = {}) {
  if (!context.organization_id) {
    const error = new Error("Service treatment readiness requires organization_id.");
    error.status = 400;
    throw error;
  }
  return context;
}

function treatmentIssues(treatment) {
  if (!treatment) return ["Treatment record has not been saved for this visit."];

  const findings = Array.isArray(treatment.pest_findings) ? treatment.pest_findings : [];
  const applications = Array.isArray(treatment.applications) ? treatment.applications : [];
  const issues = [];

  findings.forEach((finding, index) => {
    if (!text(finding?.pest_name, 120)) issues.push(`Finding ${index + 1}: identify pest or activity.`);
    if (!text(finding?.area, 200)) issues.push(`Finding ${index + 1}: record the exact area.`);
  });

  applications.forEach((application, index) => {
    if (!text(application?.item_id, 160)) issues.push(`Application ${index + 1}: select an approved Supply Chain item.`);
    if (!(Number(application?.quantity) > 0)) issues.push(`Application ${index + 1}: record a quantity greater than zero.`);
    if (!text(application?.application_method, 160)) issues.push(`Application ${index + 1}: record the treatment method.`);
    if (!text(application?.treatment_area, 240)) issues.push(`Application ${index + 1}: record the treatment area.`);
    if (application?.stock_shortage) issues.push(`Application ${index + 1}: resolve the projected stock shortage.`);
  });

  return issues;
}

export function projectServiceTreatmentReadiness(treatment, { applicable = true } = {}) {
  if (!applicable) {
    return {
      applicable: false,
      ready: true,
      status: "not_applicable",
      issues: [],
      finding_count: 0,
      application_count: 0,
      captured_at: null,
      updated_at: null,
    };
  }

  const issues = treatmentIssues(treatment);
  const findings = Array.isArray(treatment?.pest_findings) ? treatment.pest_findings : [];
  const applications = Array.isArray(treatment?.applications) ? treatment.applications : [];
  const ready = Boolean(treatment) && issues.length === 0;

  return {
    applicable: true,
    ready,
    status: ready ? "ready" : treatment ? "draft" : "missing",
    issues,
    finding_count: findings.length,
    application_count: applications.length,
    captured_at: treatment?.captured_at || null,
    updated_at: treatment?.updated_at || null,
  };
}

export async function getServiceTreatmentReadiness({ context, occurrenceId }) {
  const runtimeContext = requireContext(context);
  if (!occurrenceId) {
    const error = new Error("occurrence_id is required for treatment readiness.");
    error.status = 400;
    throw error;
  }

  const result = await supabaseAdmin
    .from("service_plan_occurrences")
    .select("id,organization_id,entity_id,work_order_id,status,attributes")
    .eq("organization_id", runtimeContext.organization_id)
    .eq("id", occurrenceId)
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) {
    const error = new Error("Service occurrence not found for treatment readiness.");
    error.status = 404;
    throw error;
  }

  const occurrence = result.data;
  if (
    runtimeContext.entity_id
    && occurrence.entity_id
    && occurrence.entity_id !== runtimeContext.entity_id
  ) {
    const error = new Error("Service occurrence is outside the active entity context.");
    error.status = 403;
    throw error;
  }

  const delivery = occurrence.attributes?.service_delivery || {};
  const applicable = normalized(delivery.industry_key) === "pest_control";
  return {
    occurrence_id: occurrence.id,
    work_order_id: occurrence.work_order_id || null,
    occurrence_status: occurrence.status || null,
    ...projectServiceTreatmentReadiness(occurrence.attributes?.service_treatment || null, { applicable }),
  };
}

export async function assertServiceTreatmentReady({ context, occurrenceId }) {
  const readiness = await getServiceTreatmentReadiness({ context, occurrenceId });
  if (!readiness.applicable || readiness.ready) return readiness;

  const visibleIssues = readiness.issues.slice(0, 4);
  const remaining = readiness.issues.length - visibleIssues.length;
  const error = new Error(
    `Treatment record is not ready for completion. ${visibleIssues.join(" ")}${remaining > 0 ? ` ${remaining} more item${remaining === 1 ? "" : "s"} remain.` : ""}`,
  );
  error.status = 409;
  error.treatment_readiness = readiness;
  throw error;
}

export default Object.freeze({
  projectServiceTreatmentReadiness,
  getServiceTreatmentReadiness,
  assertServiceTreatmentReady,
});
