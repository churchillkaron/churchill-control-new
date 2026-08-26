function text(value, limit = 6000) {
  return String(value ?? "").trim().slice(0, limit);
}

const BINDING_SUBMISSION_PATTERN = /(?:\b(?:submit|file|lodge|transmit|deliver|send)\b[\s\S]{0,120}\b(?:application|filing|return|form|declaration|certification|certificate|permit|licen[cs]e|registration|tender|bid|claim|appeal|contract|agreement|acceptance|consent|waiver|notice|regulatory\s+response|government\s+response)\b)|(?:\b(?:submit|file|lodge)\b[\s\S]{0,120}\b(?:with|to)\b[\s\S]{0,80}\b(?:authority|government|regulator|court|tax\s+office|department|agency|bank|insurer|landlord|customer|supplier|vendor)\b)/i;
const SIGNATURE_OR_ATTESTATION_PATTERN = /\b(?:sign|execute|countersign|notari[sz]e|witness|attest|certify|swear|declare)\b[\s\S]{0,120}\b(?:agreement|contract|form|application|declaration|certificate|certification|affidavit|statement|consent|waiver|filing|return|submission|document)\b/i;
const ACCEPTANCE_PATTERN = /\b(?:accept|agree\s+to|approve|confirm|consent\s+to|commit\s+to)\b[\s\S]{0,120}\b(?:terms|conditions|offer|quote|quotation|rate|fee|contract|agreement|settlement|liability|obligation|waiver|declaration|representation)\b/i;
const PAYMENT_PATTERN = /(?:\b(?:pay|remit|settle|transfer|wire|charge|debit|authorize\s+(?:a\s+)?payment|make\s+(?:a\s+)?payment)\b[\s\S]{0,120}\b(?:fee|charge|invoice|deposit|tax|duty|penalty|fine|balance|payment|amount)\b)|(?:\b(?:fee|charge|invoice|deposit|tax|duty|penalty|fine)\b[\s\S]{0,80}\b(?:pay|payment|transfer|wire|remit|settle)\b)/i;
const CREDENTIAL_PATTERN = /\b(?:password|passcode|otp|one[- ]time\s+password|api\s+key|secret|private\s+key|banking\s+credential|login\s+credential)\b/i;
const SAFE_PREPARATION_PATTERN = /\b(?:draft|prepare|assemble|organize|organise|review|compare|check|proofread|summarize|summarise|request|ask\s+for|collect|obtain|retrieve|download|locate|scan|classify|extract|identify|remind|chase|follow\s+up)\b/i;
const DIRECT_AUTHORITY_VERB_PATTERN = /\b(?:submit|file|lodge|transmit|deliver|send|sign|execute|countersign|notari[sz]e|witness|attest|certify|swear|declare|accept|agree\s+to|approve|consent\s+to|commit\s+to|pay|remit|settle|transfer|wire|charge|debit|authorize\s+(?:a\s+)?payment|make\s+(?:a\s+)?payment)\b/i;

export function secretaryPaperworkInstructionRequiresExactApproval(value) {
  const instruction = text(value);
  if (!instruction) return false;

  const binding = BINDING_SUBMISSION_PATTERN.test(instruction)
    || SIGNATURE_OR_ATTESTATION_PATTERN.test(instruction)
    || ACCEPTANCE_PATTERN.test(instruction)
    || PAYMENT_PATTERN.test(instruction)
    || CREDENTIAL_PATTERN.test(instruction);
  if (!binding) return false;

  if (SAFE_PREPARATION_PATTERN.test(instruction) && !DIRECT_AUTHORITY_VERB_PATTERN.test(instruction)) {
    return false;
  }
  return true;
}

export function secretaryPaperworkStepHasExactApproval(job = {}, step = {}) {
  const approval = step?.metadata?.approval && typeof step.metadata.approval === "object"
    ? step.metadata.approval
    : {};
  return approval.kind === "EXPLICIT_STEP_APPROVAL"
    && approval.scope === "THIS_STEP_ONLY"
    && approval.granted === true
    && text(approval.approved_job_id, 120) === text(job.id, 120)
    && text(approval.approved_step_id, 120) === text(step.id, 120)
    && text(approval.approved_action_type, 40) === text(step.action_type, 40)
    && text(approval.approved_instruction, 4000) === text(step.instruction, 4000)
    && Boolean(text(approval.approved_by_party_id, 120))
    && approval.future_steps_authorized === false
    && approval.authority_not_extended === true;
}

export function classifySecretaryPaperworkAuthority(value) {
  const instruction = text(value);
  return Object.freeze({
    exact_step_approval_required: secretaryPaperworkInstructionRequiresExactApproval(instruction),
    binding_submission_detected: BINDING_SUBMISSION_PATTERN.test(instruction),
    signature_or_attestation_detected: SIGNATURE_OR_ATTESTATION_PATTERN.test(instruction),
    acceptance_detected: ACCEPTANCE_PATTERN.test(instruction),
    payment_detected: PAYMENT_PATTERN.test(instruction),
    credential_detected: CREDENTIAL_PATTERN.test(instruction),
  });
}

export default Object.freeze({
  requiresExactApproval: secretaryPaperworkInstructionRequiresExactApproval,
  hasExactApproval: secretaryPaperworkStepHasExactApproval,
  classify: classifySecretaryPaperworkAuthority,
});
