import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getServicePlan } from "../repositories/ServicePlanRepository";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    const error = new Error(`${field} required`);
    error.status = 400;
    throw error;
  }
  return normalized;
}

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function billingProjection(plan = {}, occurrence = {}) {
  const delivery = plan?.attributes?.service_delivery || {};
  const billing = delivery.billing || {};
  const billingRuntime = delivery.billing_runtime || null;
  const completion = occurrence?.attributes?.completion || {};
  const invoice = completion.billing_invoice || null;
  const mode = String(billing.mode || "none").toLowerCase();
  const amount = billing.amount === null || billing.amount === undefined ? null : Number(billing.amount);
  const currencyCode = String(billing.currency_code || "").trim().toUpperCase() || null;
  const commercialBillable = mode === "per_visit" || mode === "recurring";
  const completionBillable = mode === "per_visit";
  const alreadyPrepaid = mode === "prepaid";
  const alreadyInvoiced = Boolean(invoice?.invoice_id);
  const completed = occurrence.status === "completed";
  const hasCommercialTerms = !commercialBillable || (Number.isFinite(amount) && amount >= 0 && Boolean(currencyCode));
  const eligible = completed && completionBillable && hasCommercialTerms && !alreadyInvoiced;

  let blockedReason = null;
  if (!completed) blockedReason = "service-not-completed";
  else if (alreadyInvoiced) blockedReason = "already-invoiced";
  else if (alreadyPrepaid) blockedReason = "prepaid-service";
  else if (mode === "none") blockedReason = "billing-disabled";
  else if (mode === "recurring") blockedReason = "recurring-billing-scheduled";
  else if (!hasCommercialTerms) blockedReason = "billing-terms-incomplete";

  return {
    mode,
    amount: Number.isFinite(amount) ? amount : null,
    currency_code: currencyCode,
    due_days: Number(billing.due_days || 0),
    tax_code_id: billing.tax_code_id || null,
    revenue_account_id: billing.revenue_account_id || null,
    commercial_document_type: billing.commercial_document_type || null,
    commercial_document_id: billing.commercial_document_id || null,
    prepaid: alreadyPrepaid,
    billable: commercialBillable,
    completion_billable: completionBillable,
    recurring_schedule: mode === "recurring" ? {
      recurrence: billing.recurrence || plan.recurrence || null,
      first_billing_at: billing.first_billing_at || plan.contract_start || null,
      next_billing_at: billingRuntime?.next_billing_at || null,
      last_billing_at: billingRuntime?.last_billing_at || null,
      status: billingRuntime?.status || "active",
      last_invoice: billingRuntime?.last_invoice || null,
      last_error: billingRuntime?.last_error || null,
    } : null,
    invoice,
    eligible,
    blocked_reason: blockedReason,
    source_document_type: "SERVICE_PLAN_OCCURRENCE",
    source_document_id: occurrence.id || null,
    completion_evidence_id: completion.completion_evidence_id || null,
  };
}

function assetProjection(reference, label = null) {
  const value = text(reference);
  if (!value) return null;
  const prefix = "storage://service-evidence/";
  return {
    reference: value,
    storage_path: value.startsWith(prefix) ? value.slice(prefix.length) : null,
    file_name: label,
  };
}

function signatureProjection(signature, label) {
  if (!signature || typeof signature !== "object") return null;
  const asset = assetProjection(signature.reference, label);
  if (!asset && !signature.signer_name) return null;
  return {
    ...(asset || {}),
    signer_name: text(signature.signer_name),
    attested_at: text(signature.attested_at),
  };
}

function evidenceProjection(record) {
  const source = record?.attributes?.service_completion_evidence || null;
  const proofs = source?.proofs || {};
  const additional = [];
  for (const [fieldKey, references] of Object.entries(proofs.field_evidence || {})) {
    (Array.isArray(references) ? references : []).forEach((reference, index) => {
      const asset = assetProjection(reference, `${fieldKey} ${index + 1}`);
      if (asset) additional.push({ ...asset, field_key: fieldKey });
    });
  }
  return {
    evidence_id: record?.id || null,
    status: record?.status || null,
    captured_at: source?.captured_at || record?.created_at || null,
    readiness: source?.readiness || null,
    before_photos: (proofs.before_photos || []).map((reference, index) => assetProjection(reference, `Before photo ${index + 1}`)).filter(Boolean),
    after_photos: (proofs.after_photos || []).map((reference, index) => assetProjection(reference, `After photo ${index + 1}`)).filter(Boolean),
    customer_signature: signatureProjection(proofs.customer_signature, "Customer signature"),
    technician_signature: signatureProjection(proofs.technician_signature, "Technician signature"),
    location_confirmation: proofs.location_confirmation || null,
    additional,
    notes: text(proofs.notes),
  };
}

async function loadCompletionEvidence({ organizationId, occurrenceId, evidenceId }) {
  if (!evidenceId) return null;
  const result = await supabaseAdmin
    .from("operations_records")
    .select("id,status,source_domain,source_type,source_id,attributes,created_at")
    .eq("organization_id", organizationId)
    .eq("capability_id", "completion-evidence")
    .eq("id", evidenceId)
    .eq("source_domain", "service-management")
    .eq("source_type", "service-occurrence")
    .eq("source_id", occurrenceId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

export async function getCompletedServiceReport({ organizationId, occurrenceId }) {
  const organization_id = required(organizationId, "organization_id");
  const occurrence_id = required(occurrenceId, "occurrence_id");

  const occurrenceResult = await supabaseAdmin
    .from("service_plan_occurrences")
    .select("*")
    .eq("organization_id", organization_id)
    .eq("id", occurrence_id)
    .maybeSingle();

  if (occurrenceResult.error) throw occurrenceResult.error;
  const occurrence = occurrenceResult.data;
  if (!occurrence) {
    const error = new Error("Service occurrence not found.");
    error.status = 404;
    throw error;
  }

  const plan = await getServicePlan({ organizationId: organization_id, planId: occurrence.service_plan_id });
  if (!plan) {
    const error = new Error("Service plan not found.");
    error.status = 404;
    throw error;
  }

  const completion = occurrence.attributes?.completion || {};
  const submission = completion.protocol_submission || {};
  const delivery = occurrence.attributes?.service_delivery || plan.attributes?.service_delivery || {};
  const protocol = delivery.execution_protocol || {};
  const treatment = occurrence.attributes?.service_treatment || {};
  const evidenceRecord = await loadCompletionEvidence({
    organizationId: organization_id,
    occurrenceId: occurrence.id,
    evidenceId: completion.completion_evidence_id || null,
  });

  return {
    report_id: `service:${occurrence.id}`,
    organization_id,
    entity_id: occurrence.entity_id || plan.entity_id || null,
    service_plan_id: plan.id,
    occurrence_id: occurrence.id,
    work_order_id: occurrence.work_order_id || null,
    status: occurrence.status,
    customer: {
      party_id: plan.customer_party_id,
      name: delivery.customer_name || plan.attributes?.service_delivery?.customer_name || null,
      location_id: plan.customer_location_id || null,
      location_name: plan.customer_location_name || null,
    },
    service: {
      name: plan.service_name,
      category: plan.service_category || null,
      industry_key: plan.industry_key || null,
      scheduled_at: occurrence.occurrence_at,
      completed_at: occurrence.completed_at || completion.completed_at || null,
      assigned_staff_id: completion.assigned_staff_id || null,
      outcome: submission.outcome || null,
      findings: submission.follow_up_notes || null,
      follow_up_required: Boolean(completion.follow_up_required),
      follow_up_work_request_id: completion.follow_up_work_request_id || null,
    },
    protocol: {
      template_id: protocol.template_id || delivery.execution_template_id || null,
      code: protocol.code || null,
      name: protocol.name || null,
      version: protocol.version || null,
      responses: submission.responses || submission.fields || {},
    },
    treatment: {
      status: treatment.status || null,
      pest_findings: Array.isArray(treatment.pest_findings) ? treatment.pest_findings : [],
      applications: Array.isArray(treatment.applications) ? treatment.applications : [],
      captured_at: treatment.captured_at || null,
      updated_at: treatment.updated_at || null,
    },
    evidence: evidenceProjection(evidenceRecord),
    materials: completion.material_movements || [],
    gps: {
      started: completion.start_gps || null,
      completed: completion.completion_gps || null,
    },
    billing: billingProjection(plan, occurrence),
    generated_at: new Date().toISOString(),
  };
}

export default getCompletedServiceReport;
