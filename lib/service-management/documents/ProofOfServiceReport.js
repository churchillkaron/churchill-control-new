function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function evidenceObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.freeze({
    external_url: text(value.external_url),
    file_name: text(value.file_name),
    mime_type: text(value.mime_type),
    size_bytes: Number.isFinite(Number(value.size_bytes)) ? Number(value.size_bytes) : null,
    evidence_type: text(value.evidence_type),
    field_key: text(value.field_key),
    uploaded_at: text(value.uploaded_at),
  });
}

function evidenceList(value) {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(value.map(evidenceObject).filter(Boolean));
}

function protocolFields(protocol = {}, submission = {}) {
  const schema = Array.isArray(protocol.field_schema) ? protocol.field_schema : [];
  const values = submission?.fields && typeof submission.fields === "object"
    ? submission.fields
    : {};

  return Object.freeze(schema.map((field) => Object.freeze({
    key: text(field?.key),
    label: text(field?.label) || text(field?.key) || "Field",
    type: text(field?.type) || "text",
    section: text(field?.section) || "Service",
    unit: text(field?.unit),
    value: values[field?.key] ?? null,
  })));
}

function materialUsage(completion = {}) {
  const movements = Array.isArray(completion.material_movements)
    ? completion.material_movements
    : [];

  return Object.freeze(movements.map((movement) => Object.freeze({
    field_key: text(movement?.field_key),
    material_name: text(movement?.material_name) || "Material",
    unit: text(movement?.unit),
    quantity: Number.isFinite(Number(movement?.quantity)) ? Number(movement.quantity) : 0,
    movement_id: text(movement?.movement_id),
    document_id: text(movement?.document_id),
  })));
}

export function createProofOfServiceReport(occurrence = {}) {
  const delivery = occurrence?.attributes?.service_delivery || {};
  const completion = occurrence?.attributes?.completion || {};
  const submission = completion?.protocol_submission || {};
  const evidence = submission?.evidence || {};
  const protocol = delivery?.execution_protocol || {};

  const customerSignature = evidenceObject(evidence.customer_signature);
  const technicianSignature = evidenceObject(evidence.technician_signature);

  return Object.freeze({
    schema_version: 1,
    report_type: "proof-of-service",
    source: Object.freeze({
      domain: "service-management",
      type: "service-plan-occurrence",
      occurrence_id: text(occurrence.id),
      service_plan_id: text(occurrence.service_plan_id),
      work_order_id: text(occurrence.work_order_id),
      completion_evidence_id: text(completion.completion_evidence_id),
    }),
    service: Object.freeze({
      customer_party_id: text(delivery.customer_party_id),
      customer_name: text(delivery.customer_name) || "Customer",
      customer_location_id: text(delivery.customer_location_id),
      customer_location_name: text(delivery.customer_location_name),
      service_name: text(delivery.service_name) || "Service",
      service_category: text(delivery.service_category),
      industry_key: text(delivery.industry_key),
      scheduled_at: text(occurrence.occurrence_at || delivery.occurrence_at),
      completed_at: text(occurrence.completed_at || completion.completed_at),
      assigned_staff_id: text(completion.assigned_staff_id),
    }),
    protocol: Object.freeze({
      template_id: text(protocol.template_id),
      code: text(protocol.code),
      name: text(protocol.name),
      version: protocol.version ?? null,
      instructions: text(protocol.instructions),
      outcome: text(submission.outcome),
      follow_up_notes: text(submission.follow_up_notes),
      fields: protocolFields(protocol, submission),
    }),
    evidence: Object.freeze({
      before_photos: evidenceList(evidence.before_photos),
      after_photos: evidenceList(evidence.after_photos),
      customer_signature: customerSignature,
      technician_signature: technicianSignature,
    }),
    materials: materialUsage(completion),
    follow_up: Object.freeze({
      required: Boolean(completion.follow_up_required),
      work_request_id: text(completion.follow_up_work_request_id),
    }),
    verification: Object.freeze({
      completion_evidence_recorded: Boolean(text(completion.completion_evidence_id)),
      customer_signature_recorded: Boolean(customerSignature?.external_url),
      technician_signature_recorded: Boolean(technicianSignature?.external_url),
      inventory_movements_recorded: materialUsage(completion).length,
      gps_included: false,
      gps_note:
        "GPS completion evidence remains authoritative in Operations and is not duplicated into this Service Management projection.",
    }),
  });
}

export default createProofOfServiceReport;
