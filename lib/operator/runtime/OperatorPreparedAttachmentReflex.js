const BANK_STATEMENT_CAPABILITY = "finance.bank_statements.create";

const DOCUMENT_FILE_CAPABILITY = "documents.files.create";
const DOCUMENT_PACK_CAPABILITY = "documents.files.createPack";
const INVENTORY_IMPORT_CAPABILITY = "supply-chain.inventory_items.import";
const PROJECT_CREATE_CAPABILITY = "projects.projects.create";
const PEOPLE_EMPLOYEE_CREATE_CAPABILITY = "people.employees.create";

function documentCreatePayload(file = {}, candidate = {}, reference = null) {
  const analysis = object(file.analysis);
  const evidence = object(analysis.evidence);
  const fields = object(evidence.key_fields || evidence.fields);
  return {
    attachment_set_id: text(file.attachment_set_id, 80),
    file_id: text(file.id, 80),
    document_name: text(fields.document_name || fields.title || evidence.title || file.name, 500) || null,
    document_type: text(evidence.document_type || evidence.object_type, 120).toUpperCase() || "FILE",
    document_number: text(fields.document_number || fields.reference_number || evidence.document_number || evidence.reference_number, 160) || null,
    classification: text(fields.classification || evidence.classification, 32).toUpperCase() || "INTERNAL",
    ...(reference?.record_type && reference?.record_id ? {
      reference_type: text(reference.record_type, 160),
      reference_id: text(reference.record_id, 160),
    } : {}),
  };
}
function projectCreatePayload(file = {}) {
  const evidence = object(object(file.analysis).evidence);
  const fields = object(evidence.key_fields || evidence.fields);
  return {
    code: text(fields.project_code || fields.project_number || fields.reference_number || evidence.project_code || evidence.project_number, 160) || null,
    name: text(fields.project_name || fields.title || fields.name || evidence.project_name || evidence.title, 500) || null,
    description: text(fields.description || evidence.summary || evidence.description, 4000) || null,
    start_date: text(fields.start_date || fields.project_start_date || evidence.start_date, 20) || null,
    end_date: text(fields.end_date || fields.project_end_date || evidence.end_date, 20) || null,
  };
}

function employeeCreatePayload(file = {}) {
  const evidence = object(object(file.analysis).evidence);
  const fields = object(evidence.key_fields || evidence.fields);
  return {
    name: text(fields.employee_name || fields.full_name || fields.person_name || fields.name || evidence.employee_name || evidence.name, 500) || null,
    email: text(fields.employee_email || fields.work_email || fields.email || evidence.employee_email || evidence.email, 320).toLowerCase() || null,
    position: text(fields.position || fields.job_title || fields.role || evidence.position || evidence.job_title, 200) || null,
    department: text(fields.department || evidence.department, 200) || null,
    effective_from: text(fields.employment_start_date || fields.start_date || evidence.employment_start_date, 20) || null,
  };
}

const SIMPLE_ATTACHMENT_PATTERN = /\b(what is this|what kind|where does|where should|which area|import|upload|record|process|reconcile|save|add|create|register|onboard|hire|file|put|bring)\b/i;
const ACTION_PATTERN = /\b(import|upload|record|process|reconcile|save|add|create|register|onboard|hire|file|attach|bring\s+(?:it|this)\s+in)\b|\bput\b[\s\S]{0,30}\b(correct|right|finance|system)\b/i;
const FILING_PATTERN = /\b(file|upload|save|attach|add)\b/i;
const PEOPLE_CREATE_PATTERN = /(?:\b(?:add|create|register|onboard|hire)\b[\s\S]{0,40}\b(?:employee|staff|person)\b)|(?:\b(?:employee|staff|person)\b[\s\S]{0,40}\b(?:add|create|register|onboard|hire)\b)/i;

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

function universalDestinationCandidates(attachments = []) {
  return list(attachments)
    .map((file) => ({ file, candidate: object(file?.prepared_candidate) }))
    .filter(({ candidate }) => candidate.type === "universal_destination");
}

function inventoryImportCandidates(attachments = []) {
  return list(attachments)
    .map((file) => ({ file, candidate: object(file?.prepared_candidate) }))
    .filter(({ candidate }) => candidate.type === "inventory_import" && candidate.recognized === true);
}

function multiObjectPdfPack(attachments = []) {
  const files = list(attachments);
  if (files.length < 2) return null;
  const first = files[0];
  const setId = text(first?.attachment_set_id, 80);
  const fileId = text(first?.id, 80);
  if (!setId || !fileId || text(first?.mime_type, 160).toLowerCase() !== "application/pdf") return null;
  if (!files.every((file) =>
    text(file?.attachment_set_id, 80) === setId &&
    text(file?.id, 80) === fileId &&
    text(file?.mime_type, 160).toLowerCase() === "application/pdf" &&
    Number(file?.logical_object_count || 0) === files.length &&
    object(file?.analysis).status === "ANALYZED" &&
    list(object(file?.evidence_span).pages).length > 0 &&
    object(file?.prepared_candidate).type === "universal_destination" &&
    object(file?.prepared_candidate).status === "DESTINATION_RESOLVED"
  )) return null;
  return { setId, fileId, files };
}

function documentPackObjectPayload(file = {}) {
  const base = documentCreatePayload(file, {}, list(object(file.business_match).candidates)[0] || null);
  return {
    logical_object_id: text(file.logical_object_id, 120) || null,
    page_numbers: list(object(file.evidence_span).pages).map(Number),
    document_name: base.document_name || `${text(file.name, 240)} · ${text(file.logical_object_id, 120) || "object"}`,
    document_type: base.document_type, document_number: base.document_number, classification: base.classification,
    ...(base.reference_type && base.reference_id ? { reference_type: base.reference_type, reference_id: base.reference_id } : {}),
  };
}

function ambiguousBusinessMatches(attachments = []) {
  return list(attachments)
    .map((file) => ({ file, match: object(file?.business_match) }))
    .filter(({ match }) => match.status === "AMBIGUOUS_MATCH");
}

function uniqueBusinessMatches(attachments = []) {
  return list(attachments)
    .map((file) => ({ file, match: object(file?.business_match) }))
    .filter(({ match }) => match.status === "UNIQUE_MATCH" && list(match.candidates).length === 1);
}

export function hasPreparedAttachmentReflexCandidate(attachments = [], message = "") {
  const bank = bankStatementCandidates(attachments);
  const inventory = inventoryImportCandidates(attachments);
  const universal = universalDestinationCandidates(attachments);
  const ambiguous = ambiguousBusinessMatches(attachments);
  const uniqueMatches = uniqueBusinessMatches(attachments);
  const pdfPack = multiObjectPdfPack(attachments);
  if (pdfPack && ambiguous.length === 0 && FILING_PATTERN.test(text(message))) return true;
  if (ambiguous.length === 1 && list(attachments).length === 1) return true;
  if (uniqueMatches.length === 1 && list(attachments).length === 1 && ACTION_PATTERN.test(text(message))) return true;
  if (bank.length === 1 && universal.length === 0 && inventory.length === 0) return true;
  if (inventory.length === 1 && bank.length === 0 && universal.length === 0 && SIMPLE_ATTACHMENT_PATTERN.test(text(message))) return true;
  return universal.length === 1 && bank.length === 0 && inventory.length === 0 && SIMPLE_ATTACHMENT_PATTERN.test(text(message));
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
  const inventory = inventoryImportCandidates(attachments);
  const universal = universalDestinationCandidates(attachments);
  const ambiguous = ambiguousBusinessMatches(attachments);
  const uniqueMatches = uniqueBusinessMatches(attachments);
  const pdfPack = multiObjectPdfPack(attachments);
  if (pdfPack && ambiguous.length === 0 && FILING_PATTERN.test(text(message))) {
    const packCapability = list(capabilities).find((item) => item?.key === DOCUMENT_PACK_CAPABILITY);
    if (packCapability) {
      return {
        response_text: `I found ${pdfPack.files.length} distinct business objects in this PDF and prepared them as separate controlled files using their original page ranges. Filing the split pack requires your confirmation.`,
        response_language: null, intent: "execute", confidence: 1,
        agreement_state: object(agreementState), project_state: object(projectState),
        clarification: { required: false, question: null, options: [] },
        navigation: { target_id: null },
        execution: {
          capability_key: DOCUMENT_PACK_CAPABILITY,
          payload: { attachment_set_id: pdfPack.setId, file_id: pdfPack.fileId, objects: pdfPack.files.map(documentPackObjectPayload) },
          reason: "PREPARED_MULTI_OBJECT_PDF_CONTROLLED_DOCUMENT_PACK",
        },
        plan: [],
      };
    }
  }
  if (pdfPack && ambiguous.length > 0 && FILING_PATTERN.test(text(message))) {
    const question = text(ambiguous[0]?.match?.clarification_question) || "One part of this PDF matches more than one existing record. Which record should I link it to before filing the split pack?";
    return {
      response_text: question, response_language: null, intent: "clarify", confidence: 1,
      agreement_state: object(agreementState), project_state: object(projectState),
      clarification: { required: true, question, options: [] },
      navigation: { target_id: null }, execution: { capability_key: null, payload: {}, reason: null }, plan: [],
    };
  }
  if (ambiguous.length === 1 && list(attachments).length === 1) {
    const match = ambiguous[0].match;
    const question = text(match.clarification_question) || "Which existing record should I use for this upload?";
    return {
      response_text: question, response_language: null, intent: "clarify", confidence: 1,
      agreement_state: object(agreementState), project_state: object(projectState),
      clarification: { required: true, question, options: [] },
      navigation: { target_id: null }, execution: { capability_key: null, payload: {}, reason: null }, plan: [],
    };
  }
  if (inventory.length === 1 && candidates.length === 0 && universal.length === 0) {
    const candidate = inventory[0].candidate;
    if (candidate.ambiguous_count > 0) {
      const question = text(candidate.clarification_question) || "Some inventory rows are ambiguous. Which existing items should those rows use?";
      return {
        response_text: question, response_language: null, intent: "clarify", confidence: 1,
        agreement_state: object(agreementState), project_state: object(projectState),
        clarification: { required: true, question, options: [] },
        navigation: { target_id: null }, execution: { capability_key: null, payload: {}, reason: null }, plan: [],
      };
    }
    const summary = `I found ${Number(candidate.row_count) || 0} inventory row${Number(candidate.row_count) === 1 ? "" : "s"}: ${Number(candidate.new_count) || 0} new, ${Number(candidate.existing_count) || 0} already existing, and ${Number(candidate.invalid_count) || 0} invalid.`;
    const requested = ACTION_PATTERN.test(text(message));
    const importCapability = list(capabilities).find((item) => item?.key === INVENTORY_IMPORT_CAPABILITY);
    const newRows = list(candidate.rows).filter((row) => row?.disposition === "NEW");
    if (requested && importCapability && newRows.length > 0 && Number(candidate.invalid_count || 0) === 0) {
      return {
        response_text: `${summary} I prepared ${newRows.length} new item${newRows.length === 1 ? "" : "s"} for atomic import. Existing item codes will be left unchanged. Import requires your confirmation.`,
        response_language: null, intent: "execute", confidence: 1,
        agreement_state: object(agreementState), project_state: object(projectState),
        clarification: { required: false, question: null, options: [] },
        navigation: { target_id: null },
        execution: { capability_key: INVENTORY_IMPORT_CAPABILITY, payload: { rows: newRows.map(({ code, name, type, cost, sale_price }) => ({ code, name, type, cost, sale_price })) }, reason: "PREPARED_INVENTORY_ITEM_ATOMIC_IMPORT" },
        plan: [],
      };
    }
    return {
      response_text: `${summary} ${Number(candidate.invalid_count || 0) > 0 ? "Fix the invalid rows before import." : "No inventory records have been changed."}`,
      response_language: null, intent: "answer", confidence: 1,
      agreement_state: object(agreementState), project_state: object(projectState),
      clarification: { required: false, question: null, options: [] },
      navigation: { target_id: null }, execution: { capability_key: null, payload: {}, reason: null }, plan: [],
    };
  }

  if (uniqueMatches.length === 1 && list(attachments).length === 1 && ACTION_PATTERN.test(text(message))) {
    const file = uniqueMatches[0].file;
    const match = uniqueMatches[0].match;
    const existing = list(match.candidates)[0] || {};
    const label = text(existing.label) || text(existing.record_type) || "existing record";
    const documentCapability = list(capabilities).find((item) => item?.key === DOCUMENT_FILE_CAPABILITY);
    const exactControlledDocument = text(existing.record_type) === "enterprise_document";
    const exactFileDuplicate = object(file.exact_duplicate).exact_bytes === true;
    const canFileLinkedEvidence = FILING_PATTERN.test(text(message))
      && !exactControlledDocument
      && !exactFileDuplicate
      && Number(file.logical_object_count || 1) === 1
      && text(file.attachment_set_id, 80)
      && text(file.id, 80)
      && text(existing.record_type, 160)
      && text(existing.record_id, 160)
      && documentCapability;
    if (canFileLinkedEvidence) {
      return {
        response_text: `This upload matches ${label} already in Avantiqo. I prepared the file as controlled evidence linked to that existing record; filing it requires your confirmation.`,
        response_language: null, intent: "execute", confidence: 1,
        agreement_state: object(agreementState), project_state: object(projectState),
        clarification: { required: false, question: null, options: [] },
        navigation: { target_id: null },
        execution: {
          capability_key: DOCUMENT_FILE_CAPABILITY,
          payload: documentCreatePayload(file, {}, existing),
          reason: "PREPARED_ATTACHMENT_LINKED_CONTROLLED_DOCUMENT_CREATE",
        },
        plan: [],
      };
    }
    return {
      response_text: `This upload matches ${label} already in Avantiqo. I have not created a duplicate record.`,
      response_language: null, intent: "answer", confidence: 1,
      agreement_state: object(agreementState), project_state: object(projectState),
      clarification: { required: false, question: null, options: [] },
      navigation: { target_id: null }, execution: { capability_key: null, payload: {}, reason: null }, plan: [],
    };
  }
  if (candidates.length === 0 && universal.length === 1 && SIMPLE_ATTACHMENT_PATTERN.test(text(message))) {
    const file = universal[0].file;
    const candidate = universal[0].candidate;
    if (candidate.status === "CLARIFICATION_REQUIRED") {
      const question = text(candidate.clarification_question) || "What business purpose should I use for this file?";
      return {
        response_text: question, response_language: null, intent: "clarify", confidence: 1,
        agreement_state: object(agreementState), project_state: object(projectState),
        clarification: { required: true, question, options: [] },
        navigation: { target_id: null }, execution: { capability_key: null, payload: {}, reason: null }, plan: [],
      };
    }
    if (candidate.status === "DESTINATION_RESOLVED" && object(candidate.destination).route) {
      const destination = object(candidate.destination);
      const classification = object(candidate.evidence_classification);
      const kind = text(classification.document_type || classification.object_type) || "file";
      const actionRequested = ACTION_PATTERN.test(text(message));
      const documentCapability = list(capabilities).find((item) => item?.key === DOCUMENT_FILE_CAPABILITY);
      const projectCapability = list(capabilities).find((item) => item?.key === PROJECT_CREATE_CAPABILITY);
      const peopleCapability = list(capabilities).find((item) => item?.key === PEOPLE_EMPLOYEE_CREATE_CAPABILITY);
      const projectPayload = projectCreatePayload(file);
      const employeePayload = employeeCreatePayload(file);
      const isProjectDestination = text(destination.domain_id).toLowerCase() === "projects";
      const isPeopleEmployeeDestination = text(destination.domain_id).toLowerCase() === "people"
        && (!text(destination.item_id) || text(destination.item_id).toLowerCase() === "employees");
      if (actionRequested && isPeopleEmployeeDestination && PEOPLE_CREATE_PATTERN.test(text(message)) && peopleCapability) {
        if (!text(entityId)) {
          const question = "Which legal entity should employ this person?";
          return {
            response_text: question, response_language: null, intent: "clarify", confidence: 1,
            agreement_state: object(agreementState), project_state: object(projectState),
            clarification: { required: true, question, options: [] },
            navigation: { target_id: null }, execution: { capability_key: null, payload: {}, reason: null }, plan: [],
          };
        }
        if (!employeePayload.name || !employeePayload.email) {
          const missing = [!employeePayload.name ? "employee name" : null, !employeePayload.email ? "employee email" : null].filter(Boolean).join(" and ");
          const question = `I identified this as employee material, but I still need the ${missing} before I can create the employee record. What should I use?`;
          return {
            response_text: question, response_language: null, intent: "clarify", confidence: 1,
            agreement_state: object(agreementState), project_state: object(projectState),
            clarification: { required: true, question, options: [] },
            navigation: { target_id: null }, execution: { capability_key: null, payload: {}, reason: null }, plan: [],
          };
        }
        return {
          response_text: `I identified this as employee material for ${employeePayload.name} and prepared a People employee record with the current legal-employer context. Creating it requires your confirmation. Portal access, payroll and compensation are not created by this action.`,
          response_language: null, intent: "execute", confidence: 1,
          agreement_state: object(agreementState), project_state: object(projectState),
          clarification: { required: false, question: null, options: [] },
          navigation: { target_id: null },
          execution: { capability_key: PEOPLE_EMPLOYEE_CREATE_CAPABILITY, payload: employeePayload, reason: "PREPARED_ATTACHMENT_EMPLOYEE_CREATE" },
          plan: [],
        };
      }
      if (isPeopleEmployeeDestination && FILING_PATTERN.test(text(message)) && documentCapability) {
        return {
          response_text: `I identified this as People material and prepared it as a controlled document. This files the evidence only; it does not create an employee, login, payroll or compensation record. Filing requires your confirmation.`,
          response_language: null, intent: "execute", confidence: 1,
          agreement_state: object(agreementState), project_state: object(projectState),
          clarification: { required: false, question: null, options: [] },
          navigation: { target_id: null },
          execution: { capability_key: DOCUMENT_FILE_CAPABILITY, payload: documentCreatePayload(file, candidate), reason: "PREPARED_PEOPLE_CONTROLLED_DOCUMENT_CREATE" },
          plan: [],
        };
      }
      if (actionRequested && isProjectDestination && projectCapability) {
        if (!projectPayload.code || !projectPayload.name) {
          const missing = [!projectPayload.code ? "project code" : null, !projectPayload.name ? "project name" : null].filter(Boolean).join(" and ");
          const question = `I identified this as project material, but I still need the ${missing} before I can create the project. What should I use?`;
          return {
            response_text: question, response_language: null, intent: "clarify", confidence: 1,
            agreement_state: object(agreementState), project_state: object(projectState),
            clarification: { required: true, question, options: [] },
            navigation: { target_id: null }, execution: { capability_key: null, payload: {}, reason: null }, plan: [],
          };
        }
        return {
          response_text: `I identified this as project material for ${projectPayload.name} (${projectPayload.code}) and prepared a new project record. Creating it requires your confirmation.`,
          response_language: null, intent: "execute", confidence: 1,
          agreement_state: object(agreementState), project_state: object(projectState),
          clarification: { required: false, question: null, options: [] },
          navigation: { target_id: null },
          execution: { capability_key: PROJECT_CREATE_CAPABILITY, payload: projectPayload, reason: "PREPARED_ATTACHMENT_PROJECT_CREATE" },
          plan: [],
        };
      }
      const canCreateDocument = actionRequested
        && text(destination.domain_id).toLowerCase() === "documents"
        && Number(file.logical_object_count || 1) === 1
        && text(file.attachment_set_id, 80)
        && text(file.id, 80)
        && documentCapability;
      if (canCreateDocument) {
        return {
          response_text: `I identified this as ${kind} and prepared it for controlled filing in ${text(destination.label) || "Documents"}. Creating the document requires your confirmation.`,
          response_language: null, intent: "execute", confidence: 1,
          agreement_state: object(agreementState), project_state: object(projectState),
          clarification: { required: false, question: null, options: [] },
          navigation: { target_id: null },
          execution: {
            capability_key: DOCUMENT_FILE_CAPABILITY,
            payload: documentCreatePayload(file, candidate),
            reason: "PREPARED_ATTACHMENT_CONTROLLED_DOCUMENT_CREATE",
          },
          plan: [],
        };
      }
      const suffix = actionRequested
        ? " I know where it belongs, but this destination does not yet expose a governed attachment action, so I have not written anything."
        : " I have not created or changed any business record.";
      return {
        response_text: `I identified this as ${kind} and routed it to ${text(destination.label) || text(destination.domain)}${destination.domain ? ` under ${destination.domain}` : ""}.${suffix}`,
        response_language: null, intent: "answer", confidence: 1,
        agreement_state: object(agreementState), project_state: object(projectState),
        clarification: { required: false, question: null, options: [] },
        navigation: { target_id: null }, execution: { capability_key: null, payload: {}, reason: null }, plan: [],
      };
    }
    return null;
  }
  if (candidates.length !== 1 || universal.length !== 0) return null;

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
