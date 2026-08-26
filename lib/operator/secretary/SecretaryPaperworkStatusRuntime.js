import { readSecretaryJob } from "@/lib/operator/secretary/SecretaryJobIntakeRuntime";

const RECEIPT_EVIDENCE_KINDS = new Set([
  "RECEIVED",
  "INBOUND_MESSAGE_ATTACHMENT",
  "SOURCE_SYSTEM_RECEIPT",
  "DOCUMENT_RECEIPT",
]);

const REVIEW_EVIDENCE_KINDS = new Set([
  "REVIEWED",
  "REVIEW_COMPLETED",
  "ACCEPTED",
  "SOURCE_SYSTEM_REVIEW",
]);

const EXECUTIVE_APPROVAL_REASONS = new Set([
  "SECRETARY_JOB_STEP_APPROVAL_REQUIRED",
  "SECRETARY_JOB_HIGH_AUTHORITY_ACTION_REQUIRES_APPROVAL",
]);

function text(value, limit = 8000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeLabel(value) {
  return text(value, 500).toLocaleLowerCase().replace(/\s+/g, " ");
}

function evidenceKind(reference = {}) {
  return text(reference.evidence_kind || reference.evidenceKind, 120).toUpperCase();
}

function hasReceiptEvidence(reference = {}) {
  const kind = evidenceKind(reference);
  return RECEIPT_EVIDENCE_KINDS.has(kind) || REVIEW_EVIDENCE_KINDS.has(kind);
}

function hasReviewEvidence(reference = {}) {
  return REVIEW_EVIDENCE_KINDS.has(evidenceKind(reference));
}

function evidenceLocator(reference = {}) {
  return {
    reference_kind: text(reference.reference_kind || reference.referenceKind, 120) || null,
    reference_id: text(reference.reference_id || reference.referenceId, 500) || null,
    uri: text(reference.uri || reference.url, 2000) || null,
    conversation_id: text(reference.conversation_id || reference.conversationId, 120) || null,
    message_id: text(reference.message_id || reference.messageId, 120) || null,
    attachment_id: text(reference.attachment_id || reference.attachmentId, 120) || null,
    evidence_kind: evidenceKind(reference) || null,
    evidence_at: text(reference.evidence_at || reference.evidenceAt, 160) || null,
    evidence_note: text(reference.evidence_note || reference.evidenceNote, 2000) || null,
  };
}

function classifyRequirement(requirement, references) {
  const label = text(requirement.label || requirement.name, 500);
  const normalized = normalizeLabel(label);
  const related = references.filter((reference) => {
    const referenceLabel = normalizeLabel(reference.label || reference.name);
    return normalized && referenceLabel === normalized;
  });
  const receiptEvidence = related.filter(hasReceiptEvidence);
  const reviewEvidence = related.filter(hasReviewEvidence);

  let state = "MISSING_OR_UNVERIFIED";
  if (reviewEvidence.length) state = "EVIDENCE_REVIEWED";
  else if (receiptEvidence.length) state = "EVIDENCE_RECEIVED_REVIEW_PENDING";
  else if (related.length) state = "REFERENCE_PRESENT_EVIDENCE_UNVERIFIED";

  return {
    label,
    mandatory: requirement.mandatory !== false,
    responsible_party_id: text(requirement.responsible_party_id || requirement.responsiblePartyId, 120) || null,
    reviewer_party_id: text(requirement.reviewer_party_id || requirement.reviewerPartyId, 120) || null,
    due_at: text(requirement.due_at || requirement.dueAt, 160) || null,
    state,
    receipt_verified: receiptEvidence.length > 0,
    review_verified: reviewEvidence.length > 0,
    evidence: related.map(evidenceLocator),
  };
}

function approvalDecision(step) {
  if (step.status !== "APPROVAL_REQUIRED" && !step.requires_approval) return null;
  const reason = text(step.last_error, 200);
  return {
    step_id: step.id,
    sequence_number: step.sequence_number,
    action_type: step.action_type,
    instruction: step.instruction,
    reason: reason || "SECRETARY_JOB_STEP_APPROVAL_REQUIRED",
    exact_step_approval_required: true,
    authority_extends_to_future_steps: false,
  };
}

function operationalBlock(step) {
  if (!["WAITING", "FAILED"].includes(step.status)) return null;
  const reason = text(step.last_error, 500) || text(step.result, 500) || "SECRETARY_PAPERWORK_STEP_WAITING";
  if (EXECUTIVE_APPROVAL_REASONS.has(reason)) return null;
  return {
    step_id: step.id,
    sequence_number: step.sequence_number,
    action_type: step.action_type,
    status: step.status,
    instruction: step.instruction,
    reason,
    approval_can_override_missing_operational_input: false,
  };
}

export async function readSecretaryPaperworkStatus({ context, payload = {} } = {}) {
  const jobId = text(payload.job_id || payload.jobId, 120);
  if (!jobId) throw new Error("SECRETARY_PAPERWORK_JOB_ID_REQUIRED");

  const result = await readSecretaryJob({ context, payload: { job_id: jobId } });
  const job = result.job;
  const metadata = object(job.metadata);
  if (text(metadata.job_kind, 120) !== "PAPERWORK_COORDINATION") {
    throw new Error("SECRETARY_PAPERWORK_JOB_REQUIRED");
  }

  const paperwork = object(metadata.paperwork_coordination);
  const requirements = list(paperwork.document_requirements);
  const references = list(paperwork.document_references);
  const requirementStatus = requirements.map((item) => classifyRequirement(object(item), references));
  const decisionsRequired = result.steps.map(approvalDecision).filter(Boolean);
  const operationalBlocks = result.steps.map(operationalBlock).filter(Boolean);

  const counts = requirementStatus.reduce((acc, item) => {
    acc.total += 1;
    if (item.receipt_verified) acc.receipt_verified += 1;
    if (item.review_verified) acc.review_verified += 1;
    if (item.state === "MISSING_OR_UNVERIFIED") acc.missing_or_unverified += 1;
    if (item.state === "REFERENCE_PRESENT_EVIDENCE_UNVERIFIED") acc.reference_present_evidence_unverified += 1;
    if (item.state === "EVIDENCE_RECEIVED_REVIEW_PENDING") acc.review_pending += 1;
    return acc;
  }, {
    total: 0,
    receipt_verified: 0,
    review_verified: 0,
    missing_or_unverified: 0,
    reference_present_evidence_unverified: 0,
    review_pending: 0,
  });

  return {
    status: "completed",
    contract: "AVANTIQO_EXECUTIVE_SECRETARY_PAPERWORK_CONTROL_V1",
    job: {
      id: job.id,
      status: job.status,
      objective: job.objective,
      next_action_at: job.next_action_at,
      completed_at: job.completed_at,
      result_summary: job.result_summary,
    },
    paperwork: {
      title: paperwork.title || null,
      purpose: paperwork.purpose || null,
      destination: paperwork.destination || null,
      due_at: paperwork.due_at || null,
      document_store: "REFERENCES_ONLY",
      requirements: requirementStatus,
      counts,
    },
    decisions_required: decisionsRequired,
    operational_blocks: operationalBlocks,
    secretary_handling: result.steps.filter((step) => ["PENDING", "RUNNING", "WAITING"].includes(step.status)),
    governance: {
      receipt_requires_explicit_evidence: true,
      review_requires_explicit_evidence: true,
      untyped_reference_is_not_receipt_evidence: true,
      untyped_reference_is_not_review_evidence: true,
      signature_authority_created: false,
      binding_submission_authority_created: false,
      legal_acceptance_authority_created: false,
      payment_authority_created: false,
      approval_scope_is_exact_step_only: true,
      approval_extends_to_future_steps: false,
      external_authority_used: false,
    },
  };
}

export default Object.freeze({
  status: readSecretaryPaperworkStatus,
});
