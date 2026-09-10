const BANK_STATEMENT_CAPABILITY = "finance.bank_statements.create";
const ACTION_PATTERN = /\b(import|upload|record|process|reconcile|save|add|file|bring\s+(?:it|this)\s+in)\b|\bput\b[\s\S]{0,30}\b(correct|right|finance|system)\b/i;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function bankStatementCandidates(attachments = []) {
  return list(attachments)
    .map((file) => ({ file, candidate: object(file?.prepared_candidate) }))
    .filter(({ candidate }) => candidate.type === "bank_statement" && candidate.recognized === true);
}

export function hasPreparedAttachmentReflexCandidate(attachments = []) {
  return bankStatementCandidates(attachments).length === 1;
}
function summary(candidate) {
  const statement = object(candidate.statement);
  const account = object(candidate.bank_account);
  const lines = list(statement.lines).length;
  const bank = text(account.bank_name || account.account_name) || "the matched bank account";
  const period = [text(statement.statement_start_date), text(statement.statement_end_date)].filter(Boolean).join(" to ");
  const currency = text(statement.currency_code);
  const closing = Number(statement.closing_balance);
  const closingText = Number.isFinite(closing)
    ? `${currency ? `${currency} ` : ""}${closing.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
    : null;
  return `I recognized this as a bank statement for ${bank}${period ? ` covering ${period}` : ""}, with ${lines} transaction line${lines === 1 ? "" : "s"}${closingText ? ` and a closing balance of ${closingText}` : ""}.`;
}

export function resolvePreparedAttachmentReflex({
  message,
  entityId,
  attachments = [],
  capabilities = [],
  agreementState = {},
  projectState = {},
} = {}) {
  const candidates = bankStatementCandidates(attachments);
  if (candidates.length !== 1) return null;

  const candidate = candidates[0].candidate;
  if (!text(entityId) || candidate.status === "CLARIFICATION_REQUIRED") {
    const question = text(candidate.clarification_question) || "Which legal entity should I use for this bank statement?";
    return {
      response_text: question,
      response_language: null,
      intent: "clarify",
      confidence: 1,
      agreement_state: object(agreementState),
      project_state: object(projectState),
      clarification: { required: true, question, options: [] },
      navigation: { target_id: null },
      execution: { capability_key: null, payload: {}, reason: null },
      plan: [],
    };
  }

  if (candidate.status !== "READY_FOR_REVIEW" || !object(candidate.import_payload).bank_account_id) {
    return null;
  }

  const base = summary(candidate);
  if (!ACTION_PATTERN.test(text(message))) {
    return {
      response_text: `${base} It is ready for review; I have not imported it.`,
      response_language: null,
      intent: "answer",
      confidence: 1,
      agreement_state: object(agreementState),
      project_state: object(projectState),
      clarification: { required: false, question: null, options: [] },
      navigation: { target_id: null },
      execution: { capability_key: null, payload: {}, reason: null },
      plan: [],
    };
  }
  const capability = list(capabilities).find((item) => item?.key === BANK_STATEMENT_CAPABILITY);
  if (!capability) {
    return {
      response_text: `${base} I cannot stage the import with the current Operator capability access, so nothing has been written.`,
      response_language: null,
      intent: "answer",
      confidence: 1,
      agreement_state: object(agreementState),
      project_state: object(projectState),
      clarification: { required: false, question: null, options: [] },
      navigation: { target_id: null },
      execution: { capability_key: null, payload: {}, reason: null },
      plan: [],
    };
  }

  return {
    response_text: `${base} The exact import is prepared and requires your confirmation.`,
    response_language: null,
    intent: "execute",
    confidence: 1,
    agreement_state: object(agreementState),
    project_state: object(projectState),
    clarification: { required: false, question: null, options: [] },
    navigation: { target_id: null },
    execution: {
      capability_key: BANK_STATEMENT_CAPABILITY,
      payload: object(candidate.import_payload),
      reason: "PREPARED_ATTACHMENT_EXACT_BANK_STATEMENT_IMPORT",
    },
    plan: [],
  };
}

export default resolvePreparedAttachmentReflex;
