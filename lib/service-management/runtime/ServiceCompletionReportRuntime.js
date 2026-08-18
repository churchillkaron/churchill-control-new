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

function billingProjection(plan = {}, occurrence = {}) {
  const billing = plan?.attributes?.service_delivery?.billing || {};
  const completion = occurrence?.attributes?.completion || {};
  const invoice = completion.billing_invoice || null;
  const mode = String(billing.mode || "none").toLowerCase();
  const amount = billing.amount === null || billing.amount === undefined
    ? null
    : Number(billing.amount);
  const currencyCode = String(billing.currency_code || "").trim().toUpperCase() || null;
  const billableMode = mode === "per_visit" || mode === "recurring";
  const alreadyPrepaid = mode === "prepaid";
  const alreadyInvoiced = Boolean(invoice?.invoice_id);
  const completed = occurrence.status === "completed";
  const hasCommercialTerms = !billableMode || (
    Number.isFinite(amount)
    && amount >= 0
    && Boolean(currencyCode)
  );

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
    billable: billableMode,
    invoice,
    eligible: completed && billableMode && hasCommercialTerms && !alreadyInvoiced,
    blocked_reason: !completed
      ? "service-not-completed"
      : alreadyInvoiced
        ? "already-invoiced"
        : alreadyPrepaid
          ? "prepaid-service"
          : mode === "none"
            ? "billing-disabled"
            : !hasCommercialTerms
              ? "billing-terms-incomplete"
              : null,
    source_document_type: "SERVICE_PLAN_OCCURRENCE",
    source_document_id: occurrence.id || null,
    completion_evidence_id: completion.completion_evidence_id || null,
  };
}

function evidenceProjection(submission = {}) {
  const evidence = submission.evidence || {};
  return {
    before_photos: Array.isArray(evidence.before_photos) ? evidence.before_photos : [],
    after_photos: Array.isArray(evidence.after_photos) ? evidence.after_photos : [],
    customer_signature: evidence.customer_signature || null,
    technician_signature: evidence.technician_signature || null,
    additional: evidence.additional || [],
  };
}

export async function getCompletedServiceReport({
  organizationId,
  occurrenceId,
}) {
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

  const plan = await getServicePlan({
    organizationId: organization_id,
    planId: occurrence.service_plan_id,
  });
  if (!plan) {
    const error = new Error("Service plan not found.");
    error.status = 404;
    throw error;
  }

  const completion = occurrence.attributes?.completion || {};
  const submission = completion.protocol_submission || {};
  const delivery = occurrence.attributes?.service_delivery || plan.attributes?.service_delivery || {};
  const protocol = delivery.execution_protocol || {};

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
      responses: submission.fields || {},
    },
    evidence: evidenceProjection(submission),
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
