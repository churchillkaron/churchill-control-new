import { getCompletedServiceReport } from "./ServiceCompletionReportRuntime";

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function formatDate(value) {
  const normalized = text(value);
  if (!normalized) return "Not recorded";
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? normalized : date.toISOString();
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "Not recorded";
  if (Array.isArray(value)) return value.map((item) => displayValue(item)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function protocolLines(report = {}) {
  const responses = report.protocol?.responses;
  if (!responses || typeof responses !== "object" || Array.isArray(responses)) return [];
  return Object.entries(responses).map(([key, value]) => `- ${key}: ${displayValue(value)}`);
}

function materialLines(report = {}) {
  const materials = Array.isArray(report.materials) ? report.materials : [];
  return materials.map((material) => {
    const name = text(material?.material_name) || text(material?.name) || "Material";
    const quantity = Number.isFinite(Number(material?.quantity)) ? Number(material.quantity) : 0;
    const unit = text(material?.unit);
    return `- ${name}: ${quantity}${unit ? ` ${unit}` : ""}`;
  });
}

function evidenceAttachment(evidence, label, kind) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return null;
  const externalUrl = text(evidence.external_url);
  const storagePath = text(evidence.storage_path);
  if (!externalUrl && !storagePath) return null;
  return Object.freeze({
    external_url: externalUrl,
    storage_path: storagePath,
    file_name: text(evidence.file_name) || label,
    mime_type: text(evidence.mime_type),
    size_bytes: Number.isFinite(Number(evidence.size_bytes)) ? Number(evidence.size_bytes) : null,
    metadata: Object.freeze({
      source: "service-management",
      source_type: "completed-service-report",
      evidence_kind: kind,
      label,
    }),
  });
}

function evidenceAttachments(report = {}) {
  const evidence = report.evidence || {};
  const attachments = [];
  const groups = [
    ["before_photos", "Before photo", "before_photo"],
    ["after_photos", "After photo", "after_photo"],
    ["additional", "Service evidence", "additional_evidence"],
  ];

  for (const [key, label, kind] of groups) {
    const items = Array.isArray(evidence[key]) ? evidence[key] : [];
    items.forEach((item, index) => {
      const attachment = evidenceAttachment(item, `${label} ${index + 1}`, kind);
      if (attachment) attachments.push(attachment);
    });
  }

  const customerSignature = evidenceAttachment(
    evidence.customer_signature,
    "Customer signature",
    "customer_signature",
  );
  if (customerSignature) attachments.push(customerSignature);

  const technicianSignature = evidenceAttachment(
    evidence.technician_signature,
    "Technician signature",
    "technician_signature",
  );
  if (technicianSignature) attachments.push(technicianSignature);

  return Object.freeze(attachments.slice(0, 10));
}

export function createServiceReportDeliveryDraft(report = {}) {
  const serviceName = text(report.service?.name) || "Completed service";
  const customerName = text(report.customer?.name) || "Customer";
  const locationName = text(report.customer?.location_name);
  const outcome = text(report.service?.outcome);
  const findings = text(report.service?.findings);
  const protocol = protocolLines(report);
  const materials = materialLines(report);
  const attachments = evidenceAttachments(report);

  const lines = [
    `Hello ${customerName},`,
    "",
    `Your ${serviceName} has been completed${locationName ? ` at ${locationName}` : ""}.`,
    `Completed: ${formatDate(report.service?.completed_at)}`,
  ];

  if (outcome) lines.push(`Outcome: ${outcome}`);
  if (findings) lines.push(`Service notes: ${findings}`);
  if (protocol.length) lines.push("", "Service record:", ...protocol);
  if (materials.length) lines.push("", "Materials used:", ...materials);
  if (report.service?.follow_up_required) {
    lines.push("", "A follow-up has been recorded for this service.");
  }
  if (attachments.length) {
    lines.push("", "Supporting service evidence is attached to this message.");
  }
  lines.push("", "Thank you.");

  return Object.freeze({
    schema_version: 1,
    draft_type: "completed-service-customer-message",
    source: Object.freeze({
      report_id: text(report.report_id),
      occurrence_id: text(report.occurrence_id),
      service_plan_id: text(report.service_plan_id),
      work_order_id: text(report.work_order_id),
    }),
    customer: Object.freeze({
      party_id: text(report.customer?.party_id),
      name: customerName,
    }),
    subject: `Service completed — ${serviceName}`,
    body: lines.join("\n"),
    attachments,
    delivery: Object.freeze({
      owner_domain: "commercial.communications",
      requires_existing_or_new_customer_conversation: true,
      requires_explicit_send_confirmation: true,
      auto_send: false,
    }),
  });
}

export async function getServiceReportDeliveryDraft({ organizationId, occurrenceId }) {
  const report = await getCompletedServiceReport({ organizationId, occurrenceId });
  if (String(report.status || "").toLowerCase() !== "completed") {
    const error = new Error("Only completed service occurrences can prepare customer delivery.");
    error.status = 409;
    throw error;
  }
  return createServiceReportDeliveryDraft(report);
}

export default getServiceReportDeliveryDraft;
