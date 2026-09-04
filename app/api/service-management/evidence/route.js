export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import {
  resolveServiceManagementContext,
  searchParamsToServiceInput,
} from "@/lib/service-management/api/resolveServiceManagementContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ACTIVE_EVIDENCE_STATUSES = new Set(["recorded", "validated"]);
const EXTERNAL_FIELD_TYPES = new Set(["photo", "signature", "file"]);

function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function responseError(error, status = 500) {
  return Response.json(
    { success: false, error: error?.message || error || "Service evidence request failed." },
    { status: error?.status || status },
  );
}

function evidenceError(message, status = 409) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function loadOccurrence({ organizationId, occurrenceId }) {
  const result = await supabaseAdmin
    .from("service_plan_occurrences")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", occurrenceId)
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) throw evidenceError("Service occurrence not found.", 404);
  return result.data;
}

async function loadWorkOrder({ context, occurrence }) {
  if (!occurrence.work_order_id) throw evidenceError("This service occurrence has no generated work order.");

  const detail = await serverOperationsApi.detail({
    capabilityId: "work-orders",
    id: occurrence.work_order_id,
    context: {
      ...context,
      entity_id: occurrence.entity_id || context.entity_id || null,
      period_id: null,
    },
  });

  if (detail.status >= 400 || !detail.body?.ok || !detail.body?.record) {
    throw evidenceError(detail.body?.error || "Linked service work order could not be loaded.", detail.status || 404);
  }
  return detail.body.record;
}

function deliveryFor(occurrence, workOrder) {
  return workOrder?.attributes?.service_delivery || occurrence?.attributes?.service_delivery || {};
}

function protocolFor(occurrence, workOrder) {
  return deliveryFor(occurrence, workOrder).execution_protocol || null;
}

function proofReferences(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const one = text(value);
  return one ? [one] : [];
}

function signatureProof(value = {}) {
  if (!value || typeof value !== "object") return { signer_name: null, reference: null, attested_at: null };
  return {
    signer_name: text(value.signer_name || value.signerName) || null,
    reference: text(value.reference || value.reference_id || value.referenceId) || null,
    attested_at: text(value.attested_at || value.attestedAt) || null,
  };
}

function locationProof(value = {}) {
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);
  return {
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    accuracy_m: Number.isFinite(Number(value?.accuracy_m ?? value?.accuracy)) ? Number(value?.accuracy_m ?? value?.accuracy) : null,
    captured_at: text(value?.captured_at || value?.capturedAt) || null,
  };
}

function normalizeEvidenceInput(body = {}) {
  const proofs = body.proofs && typeof body.proofs === "object" ? body.proofs : {};
  const fieldEvidence = body.fieldEvidence && typeof body.fieldEvidence === "object"
    ? body.fieldEvidence
    : body.field_evidence && typeof body.field_evidence === "object"
      ? body.field_evidence
      : {};

  return {
    before_photos: proofReferences(proofs.before_photos || proofs.beforePhotos),
    after_photos: proofReferences(proofs.after_photos || proofs.afterPhotos),
    customer_signature: signatureProof(proofs.customer_signature || proofs.customerSignature),
    technician_signature: signatureProof(proofs.technician_signature || proofs.technicianSignature),
    location_confirmation: locationProof(proofs.location_confirmation || proofs.locationConfirmation),
    field_evidence: Object.fromEntries(
      Object.entries(fieldEvidence).map(([key, value]) => [key, proofReferences(value)]),
    ),
    notes: text(body.notes) || null,
  };
}

function validateEvidencePackage(protocol, evidence) {
  if (!protocol) throw evidenceError("This visit has no snapshotted treatment protocol. Evidence cannot be certified without the governing protocol.");

  const requirements = protocol.evidence_requirements || {};
  const missing = [];
  if (requirements.before_photos && !evidence.before_photos.length) missing.push("before photos");
  if (requirements.after_photos && !evidence.after_photos.length) missing.push("after photos");
  if (requirements.customer_signature && (!evidence.customer_signature.signer_name || !evidence.customer_signature.reference)) missing.push("customer signature proof");
  if (requirements.technician_signature && (!evidence.technician_signature.signer_name || !evidence.technician_signature.reference)) missing.push("technician signature proof");
  if (requirements.location_confirmation && (evidence.location_confirmation.latitude === null || evidence.location_confirmation.longitude === null)) missing.push("location confirmation");

  const fields = Array.isArray(protocol.field_schema) ? protocol.field_schema : [];
  for (const field of fields) {
    if (!field?.required || !EXTERNAL_FIELD_TYPES.has(normalized(field.type))) continue;
    if (!(evidence.field_evidence[field.key] || []).length) missing.push(field.label || field.key || "required evidence");
  }

  if (missing.length) {
    throw evidenceError(`Required completion proof is missing: ${missing.join(", ")}.`);
  }

  return {
    required_count: [
      requirements.before_photos,
      requirements.after_photos,
      requirements.customer_signature,
      requirements.technician_signature,
      requirements.location_confirmation,
      ...fields.filter((field) => field?.required && EXTERNAL_FIELD_TYPES.has(normalized(field.type))),
    ].filter(Boolean).length,
    missing: [],
    ready: true,
  };
}

async function listEvidence({ organizationId, occurrenceId }) {
  const result = await supabaseAdmin
    .from("operations_records")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("capability_id", "completion-evidence")
    .eq("source_domain", "service-management")
    .eq("source_type", "service-occurrence")
    .eq("source_id", occurrenceId)
    .order("created_at", { ascending: false })
    .limit(25);

  if (result.error) throw result.error;
  return result.data || [];
}

function projection({ occurrence, workOrder, evidenceRows }) {
  const delivery = deliveryFor(occurrence, workOrder);
  const protocol = protocolFor(occurrence, workOrder);
  const current = evidenceRows.find((row) => ACTIVE_EVIDENCE_STATUSES.has(normalized(row.status))) || evidenceRows[0] || null;

  return {
    occurrence_id: occurrence.id,
    occurrence_status: occurrence.status,
    occurrence_at: occurrence.occurrence_at,
    work_order_id: workOrder.id,
    work_order_status: workOrder.status,
    customer_name: delivery.customer_name || null,
    customer_location_name: delivery.customer_location_name || null,
    service_name: delivery.service_name || workOrder.name || "Service",
    protocol,
    current_evidence: current,
    evidence_history: evidenceRows,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const input = searchParamsToServiceInput(url.searchParams);
    const resolved = await resolveServiceManagementContext({ request, input });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const occurrenceId = text(input.occurrenceId || input.occurrence_id);
    if (!occurrenceId) return responseError("occurrence_id is required.", 400);

    const occurrence = await loadOccurrence({ organizationId: resolved.context.organization_id, occurrenceId });
    const workOrder = await loadWorkOrder({ context: resolved.context, occurrence });
    const evidenceRows = await listEvidence({ organizationId: resolved.context.organization_id, occurrenceId });

    return Response.json({ success: true, ...projection({ occurrence, workOrder, evidenceRows }) });
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const resolved = await resolveServiceManagementContext({ request, input: body });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const occurrenceId = text(body.occurrenceId || body.occurrence_id);
    if (!occurrenceId) return responseError("occurrence_id is required.", 400);

    const occurrence = await loadOccurrence({ organizationId: resolved.context.organization_id, occurrenceId });
    const workOrder = await loadWorkOrder({ context: resolved.context, occurrence });
    const protocol = protocolFor(occurrence, workOrder);
    const evidence = normalizeEvidenceInput(body);
    const readiness = validateEvidencePackage(protocol, evidence);
    const existing = await listEvidence({ organizationId: resolved.context.organization_id, occurrenceId });
    const current = existing.find((row) => ACTIVE_EVIDENCE_STATUSES.has(normalized(row.status))) || null;
    const capturedAt = new Date().toISOString();
    const delivery = deliveryFor(occurrence, workOrder);
    const runtimeContext = {
      ...resolved.context,
      entity_id: occurrence.entity_id || resolved.context.entity_id || null,
      period_id: workOrder.period_id || null,
    };
    const submissionKey = text(body.submissionKey || body.submission_key) || crypto.randomUUID();

    const response = await serverOperationsApi.execute({
      capabilityId: "completion-evidence",
      command: "record",
      context: runtimeContext,
      payload: {
        name: `Service proof — ${delivery.service_name || workOrder.name || "Service"}${delivery.customer_name ? ` — ${delivery.customer_name}` : ""}`,
        description: "Governed completion proof captured for a service occurrence.",
        source_domain: "service-management",
        source_type: "service-occurrence",
        source_id: occurrence.id,
        idempotency_key: `service-completion-evidence:${occurrence.id}:${submissionKey}`,
        attributes: {
          service_completion_evidence: {
            schema_version: 1,
            service_plan_id: occurrence.service_plan_id,
            occurrence_id: occurrence.id,
            work_order_id: workOrder.id,
            customer_party_id: delivery.customer_party_id || null,
            customer_name: delivery.customer_name || null,
            customer_location_id: delivery.customer_location_id || null,
            customer_location_name: delivery.customer_location_name || null,
            service_name: delivery.service_name || workOrder.name || null,
            service_category: delivery.service_category || null,
            industry_key: delivery.industry_key || null,
            protocol: protocol ? {
              template_id: protocol.template_id || null,
              code: protocol.code || null,
              name: protocol.name || null,
              version: protocol.version || null,
              snapshotted_at: protocol.snapshotted_at || null,
            } : null,
            readiness,
            proofs: evidence,
            captured_at: capturedAt,
            captured_by: resolved.context.actor_id || null,
          },
        },
      },
    });

    if (response.status >= 400 || !response.body?.ok) {
      throw evidenceError(response.body?.error || "Completion Evidence could not be recorded.", response.status || 500);
    }

    const record = response.body.execution?.result || null;
    if (!record?.id) throw evidenceError("Completion Evidence returned no record id.", 500);

    if (current?.id && current.id !== record.id && ["recorded", "validated", "rejected"].includes(normalized(current.status))) {
      const supersede = await serverOperationsApi.execute({
        capabilityId: "completion-evidence",
        command: "supersede",
        context: runtimeContext,
        payload: {
          id: current.id,
          superseded_by: record.id,
          superseded_at: capturedAt,
        },
      });
      if (supersede.status >= 400 || !supersede.body?.ok) {
        throw evidenceError(supersede.body?.error || "New evidence was recorded but the previous evidence package could not be superseded.", supersede.status || 500);
      }
    }

    return Response.json({
      success: true,
      evidence_id: record.id,
      readiness,
      record,
    });
  } catch (error) {
    return responseError(error);
  }
}
