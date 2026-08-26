import { delegateSecretaryJob } from "@/lib/operator/secretary/SecretaryJobIntakeRuntime";

function text(value, limit = 8000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== ""),
  );
}

function documentRequirement(item = {}) {
  return compactObject({
    label: text(item.label || item.name || item.document_type || item.documentType, 500) || null,
    description: text(item.description || item.details, 2000) || null,
    responsible_party_id: text(item.responsible_party_id || item.responsiblePartyId, 120) || null,
    reviewer_party_id: text(item.reviewer_party_id || item.reviewerPartyId, 120) || null,
    due_at: text(item.due_at || item.dueAt, 160) || null,
    mandatory: item.mandatory !== false,
    notes: text(item.notes, 2000) || null,
  });
}

function documentReference(item = {}) {
  return compactObject({
    label: text(item.label || item.name, 500) || null,
    reference_kind: text(item.reference_kind || item.referenceKind || item.source, 120) || "REFERENCE",
    reference_id: text(item.reference_id || item.referenceId || item.id, 500) || null,
    uri: text(item.uri || item.url, 2000) || null,
    conversation_id: text(item.conversation_id || item.conversationId, 120) || null,
    message_id: text(item.message_id || item.messageId, 120) || null,
    attachment_id: text(item.attachment_id || item.attachmentId, 120) || null,
    evidence_kind: text(item.evidence_kind || item.evidenceKind, 120) || null,
    evidence_at: text(item.evidence_at || item.evidenceAt, 160) || null,
    evidence_note: text(item.evidence_note || item.evidenceNote, 2000) || null,
  });
}

function paperworkRequest(payload = {}, context = {}) {
  const request = text(payload.request || payload.objective, 8000);
  const title = text(payload.title, 1000);
  const requirements = list(payload.document_requirements || payload.documentRequirements)
    .map(documentRequirement)
    .filter((item) => item.label)
    .slice(0, 60);
  const references = list(payload.document_references || payload.documentReferences)
    .map(documentReference)
    .filter((item) => item.reference_id || item.uri || item.message_id || item.attachment_id)
    .slice(0, 100);

  if (!request && !title && !requirements.length) {
    throw new Error("SECRETARY_PAPERWORK_REQUEST_REQUIRED");
  }

  return compactObject({
    request: request || null,
    title: title || null,
    purpose: text(payload.purpose, 2000) || null,
    destination: text(payload.destination, 2000) || null,
    due_at: text(payload.due_at || payload.dueAt, 160) || null,
    timezone: text(payload.timezone || context.timezone, 120) || null,
    document_requirements: requirements,
    document_references: references,
    reviewer_party_ids: list(payload.reviewer_party_ids || payload.reviewerPartyIds)
      .map((value) => text(value, 120))
      .filter(Boolean)
      .slice(0, 30),
    responsible_party_ids: list(payload.responsible_party_ids || payload.responsiblePartyIds)
      .map((value) => text(value, 120))
      .filter(Boolean)
      .slice(0, 30),
    package_notes: text(payload.package_notes || payload.packageNotes, 4000) || null,
  });
}

function paperworkObjective(request) {
  const facts = [
    request.request ? `User request: ${request.request}` : null,
    request.title ? `Paperwork package: ${request.title}` : null,
    request.purpose ? `Purpose: ${request.purpose}` : null,
    request.destination ? `Intended destination: ${request.destination}` : null,
    request.due_at ? `Due at: ${request.due_at}` : null,
    request.timezone ? `Primary timezone: ${request.timezone}` : null,
    request.document_requirements?.length
      ? `Required documents: ${JSON.stringify(request.document_requirements)}`
      : null,
    request.document_references?.length
      ? `Known document references and evidence locators: ${JSON.stringify(request.document_references)}`
      : null,
    request.reviewer_party_ids?.length
      ? `Known reviewer party IDs: ${JSON.stringify(request.reviewer_party_ids)}`
      : null,
    request.responsible_party_ids?.length
      ? `Known responsible party IDs: ${JSON.stringify(request.responsible_party_ids)}`
      : null,
    request.package_notes ? `Package notes: ${request.package_notes}` : null,
  ].filter(Boolean);

  return [
    "Coordinate this paperwork as an Avantiqo Executive Secretary-owned durable job.",
    ...facts,
    "Identify what is missing, request it from the responsible known contacts, chase outstanding items, create useful internal tasks/reminders, coordinate review, prepare the package, surface unresolved problems, and keep following through until the paperwork is complete or the job is cancelled.",
    "Use document references only as locators to evidence in the real source system. Do not invent a Secretary file vault, copy, attachment, signature, review result, submission receipt, approval or document contents.",
    "A document may be described as received only when there is explicit receipt evidence such as an identified inbound message/attachment, source-system reference, or other recorded evidence. A document may be described as reviewed or accepted only when explicit review/acceptance evidence exists.",
    "If receipt or review evidence is missing or ambiguous, state that it is unverified and continue the appropriate request, chase, review or clarification workflow instead of assuming success.",
    "Preparing, organizing, comparing, requesting, chasing, reminding and assembling paperwork are ordinary Secretary coordination actions.",
    "Any signature, execution of an agreement, binding application/form/filing/submission, legal or commercial acceptance, certification made on the user's behalf, fee, purchase, payment or other external commitment must stop at review and requires explicit approval bound to that exact Secretary job step.",
    "Approval for one step never authorizes a later signature, submission, acceptance, fee or payment.",
  ].join(" ");
}

function defaultSuccessCriteria(request) {
  const criteria = [
    "Every required document is tracked as missing, requested, evidence-received, under review, evidence-reviewed, unresolved or not applicable; no receipt or review status is invented.",
    "Missing documents are requested from known responsible contacts and chased through the durable Secretary follow-through workflow until resolved or surfaced for intervention.",
    "Known deadlines, dependencies and reviewer responsibilities are tracked with appropriate Secretary tasks/reminders when supported by exact facts.",
    "The prepared package clearly distinguishes evidence-backed documents from missing, unverified, rejected or review-pending items.",
    "Document references remain locators to the real source systems; no unverified Secretary document repository is claimed.",
    "Any signature, binding submission or filing, legal/commercial acceptance, certification, fee or payment remains behind exact-step approval and is never inferred from general delegation.",
    "The Secretary owns follow-through until the paperwork job is completed, failed with explicit evidence, or cancelled.",
  ];
  if (request.due_at) criteria.push("The stated paperwork deadline is tracked without inventing a timezone or completion state.");
  return criteria;
}

export async function delegateSecretaryPaperworkCoordination({ context, payload = {} } = {}) {
  const request = paperworkRequest(payload, context);
  const userCriteria = list(payload.success_criteria || payload.successCriteria)
    .map((item) => text(item, 1200))
    .filter(Boolean)
    .slice(0, 20);

  const approvalPolicy = {
    ...object(payload.approval_policy || payload.approvalPolicy),
    paperwork_signature_requires_exact_step_approval: true,
    paperwork_binding_submission_requires_exact_step_approval: true,
    paperwork_legal_acceptance_requires_exact_step_approval: true,
    paperwork_fee_or_payment_requires_exact_step_approval: true,
    approval_scope_is_exact_step_only: true,
  };

  const delegated = await delegateSecretaryJob({
    context,
    payload: {
      objective: paperworkObjective(request),
      success_criteria: [...defaultSuccessCriteria(request), ...userCriteria].slice(0, 30),
      autonomy_level: text(payload.autonomy_level || payload.autonomyLevel, 60) || "EXECUTE_WITH_GATES",
      approval_policy: approvalPolicy,
      entity_id: payload.entity_id || payload.entityId,
      timezone: request.timezone || payload.timezone,
      max_attempts: payload.max_attempts || payload.maxAttempts,
      metadata: {
        ...object(payload.metadata),
        job_kind: "PAPERWORK_COORDINATION",
        paperwork_coordination: request,
        document_store: "REFERENCES_ONLY",
        document_receipt_requires_explicit_evidence: true,
        document_review_requires_explicit_evidence: true,
        signature_authority_created: false,
        binding_submission_authority_created: false,
        legal_acceptance_authority_created: false,
        payment_authority_created: false,
        external_authority_used: false,
      },
    },
  });

  return {
    ...delegated,
    paperwork_coordination: true,
    document_store: "REFERENCES_ONLY",
    document_receipt_requires_explicit_evidence: true,
    document_review_requires_explicit_evidence: true,
    signature_authority_created: false,
    binding_submission_authority_created: false,
    legal_acceptance_authority_created: false,
    payment_authority_created: false,
    external_authority_used: false,
  };
}

export default Object.freeze({
  coordinate: delegateSecretaryPaperworkCoordination,
});
