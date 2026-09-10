const BANK_STATEMENT_CAPABILITY = "finance.bank_statements.create";

const DOCUMENT_FILE_CAPABILITY = "documents.files.create";
const DOCUMENT_PACK_CAPABILITY = "documents.files.createPack";
const INVENTORY_IMPORT_CAPABILITY = "supply-chain.inventory_items.import";
const PROJECT_CREATE_CAPABILITY = "projects.projects.create";
const PEOPLE_EMPLOYEE_CREATE_CAPABILITY = "people.employees.create";
const COMPLIANCE_ASSET_CREATE_CAPABILITY = "compliance.assets.create";
const OPERATIONS_WORK_ORDER_CREATE_CAPABILITY = "operations.work_orders.create";
const COMMERCIAL_CUSTOMER_CREATE_CAPABILITY = "commercial.customers.create";
const PAID_EXPENSE_RECEIPT_CAPABILITY = "finance.expense_receipts.post";
const FINANCE_VENDOR_BILL_CAPABILITY = "finance.vendor_bills.create";
const SUPPLY_CHAIN_PURCHASE_ORDER_CAPABILITY = "supply-chain.purchase_orders.create";

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

function commercialCustomerPayload(file = {}) {
  const evidence = object(object(file.analysis).evidence);
  const fields = object(evidence.key_fields || evidence.fields);
  const parties = list(evidence.parties);
  const primary = object(parties[0]);
  const companyName = text(fields.customer_name || fields.company_name || fields.legal_name || fields.name || evidence.customer_name || evidence.company_name || evidence.title || primary.name,500) || null;
  return {
    customer_name: companyName,
    customer_type: text(fields.customer_type || fields.party_type || (fields.company_name || fields.legal_name ? "COMPANY" : "PERSON"),40).toUpperCase(),
    customer_email: text(fields.customer_email || fields.email || fields.contact_email || primary.email,320).toLowerCase() || null,
    customer_phone: text(fields.customer_phone || fields.phone || fields.contact_phone || primary.phone,120) || null,
    legal_name: text(fields.legal_name || fields.company_name,500) || null,
    tax_id: text(fields.tax_id || fields.tax_number || fields.vat_number,160) || null,
    address: text(fields.address || fields.billing_address,1000) || null,
    customer_number: text(fields.customer_number || fields.customer_no || fields.account_number,160) || null,
    preferred_currency: text(fields.currency || fields.currency_code || fields.preferred_currency,12).toUpperCase() || null,
    payment_terms: text(fields.payment_terms,120) || null, country: text(fields.country,120) || null, city: text(fields.city,160) || null,
    postal_code: text(fields.postal_code || fields.zip,40) || null, notes: text(fields.notes || evidence.summary,2000) || null,
  };
}

function operationsWorkOrderPayload(file = {}) {
  const evidence = object(object(file.analysis).evidence);
  const fields = object(evidence.key_fields || evidence.fields);
  const code = text(fields.work_order_code || fields.work_order_number || fields.work_order_reference || fields.job_number || fields.service_order_number || fields.service_reference,160) || null;
  const name = text(fields.work_name || fields.service_name || fields.maintenance_task || fields.title || evidence.title || evidence.summary,500) || null;
  const description = text(fields.description || fields.scope || fields.work_description || evidence.description || evidence.summary,4000) || null;
  const priority = text(fields.priority || evidence.priority,40).toLowerCase();
  return {
    name, code, description,
    ...( ["low","normal","high","critical"].includes(priority) ? { priority } : {} ),
    attributes: {
      source: "business_partner_attachment",
      logical_object_id: text(file.logical_object_id,120) || null,
      source_attachment_sha256: text(file.sha256,128) || null,
      asset_code: text(fields.asset_code || object(evidence.asset_details).asset_code,160) || null,
      serial_number: text(fields.serial_number || object(evidence.asset_details).serial_number,300) || null,
      location: text(fields.location || fields.location_text || object(evidence.asset_details).location,500) || null,
    },
  };
}

function complianceAssetCreatePayload(file = {}, destination = {}) {
  const evidence = object(object(file.analysis).evidence);
  const fields = object(evidence.key_fields || evidence.fields);
  const asset = object(evidence.asset_details);
  const itemId = text(destination.item_id,80).toLowerCase();
  const inferredType = itemId === "vehicles" ? "VEHICLE" : itemId === "properties" ? "PROPERTY" : itemId === "digital_assets" ? "DIGITAL_ASSET" : "EQUIPMENT";
  return {
    asset_type: text(asset.asset_type || fields.asset_type || inferredType,40).toUpperCase(),
    asset_code: text(asset.asset_code || fields.asset_code || fields.equipment_code || fields.vehicle_code || fields.property_code || fields.code,160) || null,
    name: text(asset.name || fields.asset_name || fields.name || fields.title || evidence.title,500) || null,
    description: text(asset.description || fields.description || evidence.summary || evidence.description,4000) || null,
    manufacturer: text(asset.manufacturer || fields.manufacturer,300) || null, model: text(asset.model || fields.model,300) || null,
    serial_number: text(asset.serial_number || fields.serial_number || fields.serial_no,300) || null,
    registration_number: text(asset.registration_number || fields.registration_number || fields.registration_no || fields.license_plate,300) || null,
    reference_identifier: text(asset.reference_identifier || fields.reference_identifier || fields.domain || fields.domain_name || fields.asset_reference,500) || null,
    location_text: text(asset.location || asset.location_text || fields.location || fields.location_text,500) || null,
    ownership_type: text(asset.ownership_type || fields.ownership_type || "OWNED",40).toUpperCase(),
    acquired_on: text(asset.acquired_on || asset.purchase_date || fields.acquired_on || fields.purchase_date,20) || null,
    acquisition_cost: Number.isFinite(Number(asset.acquisition_cost ?? asset.purchase_cost ?? fields.acquisition_cost ?? fields.purchase_cost)) ? Number(asset.acquisition_cost ?? asset.purchase_cost ?? fields.acquisition_cost ?? fields.purchase_cost) : null,
    currency_code: text(asset.currency || asset.currency_code || fields.currency || fields.currency_code,12).toUpperCase() || null,
    warranty_expires_on: text(asset.warranty_expires_on || fields.warranty_expires_on || fields.warranty_expiry_date,20) || null,
    inspection_due_on: text(asset.inspection_due_on || fields.inspection_due_on,20) || null,
    maintenance_due_on: text(asset.maintenance_due_on || fields.maintenance_due_on,20) || null,
    source_attachment_sha256: text(file.sha256,128) || null,
    attributes: { source: "business_partner_attachment", logical_object_id: text(file.logical_object_id,120) || null },
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

const SIMPLE_ATTACHMENT_PATTERN = /\b(what is this|what kind|where does|where should|which area|import|upload|record|process|reconcile|save|add|create|register|onboard|hire|open|file|put|bring)\b/i;
const ACTION_PATTERN = /\b(import|upload|record|process|reconcile|save|add|create|register|onboard|hire|open|file|attach|bring\s+(?:it|this)\s+in)\b|\bput\b[\s\S]{0,30}\b(correct|right|finance|system)\b/i;
const FILING_PATTERN = /\b(file|upload|save|attach|add)\b/i;
const PEOPLE_CREATE_PATTERN = /(?:\b(?:add|create|register|onboard|hire)\b[\s\S]{0,40}\b(?:employee|staff|person)\b)|(?:\b(?:employee|staff|person)\b[\s\S]{0,40}\b(?:add|create|register|onboard|hire)\b)/i;
const ASSET_CREATE_PATTERN = /(?:\b(?:add|create|register)\b[\s\S]{0,50}\b(?:asset|equipment|vehicle|property|domain|device|machine|tool)\b)|(?:\b(?:asset|equipment|vehicle|property|domain|device|machine|tool)\b[\s\S]{0,50}\b(?:add|create|register)\b)/i;
const OPERATIONS_WORK_CREATE_PATTERN = /(?:\b(?:create|add|register|open)\b[\s\S]{0,60}\b(?:work order|maintenance|repair|service work|job)\b)|(?:\b(?:work order|maintenance|repair|service work|job)\b[\s\S]{0,60}\b(?:create|add|register|open)\b)/i;
const CUSTOMER_CREATE_PATTERN = /(?:\b(?:create|add|register)\b[\s\S]{0,50}\b(?:customer|client)\b)|(?:\b(?:customer|client)\b[\s\S]{0,50}\b(?:create|add|register)\b)/i;

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

function paidExpenseReceiptCandidates(attachments = []) {
  return list(attachments)
    .map((file) => ({ file, candidate: object(file?.prepared_candidate) }))
    .filter(({ candidate }) => candidate.type === "paid_expense_receipt" && candidate.recognized === true);
}

function vendorBillCandidates(attachments = []) {
  return list(attachments)
    .map((file) => ({ file, candidate: object(file?.prepared_candidate) }))
    .filter(({ candidate }) => candidate.type === "vendor_bill" && candidate.recognized === true);
}

function purchaseOrderCandidates(attachments = []) {
  return list(attachments)
    .map((file) => ({ file, candidate: object(file?.prepared_candidate) }))
    .filter(({ candidate }) => candidate.type === "purchase_order" && candidate.recognized === true);
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
  const paidExpenses = paidExpenseReceiptCandidates(attachments);
  const vendorBills = vendorBillCandidates(attachments);
  const purchaseOrders = purchaseOrderCandidates(attachments);
  const universal = universalDestinationCandidates(attachments);
  const ambiguous = ambiguousBusinessMatches(attachments);
  const uniqueMatches = uniqueBusinessMatches(attachments);
  const pdfPack = multiObjectPdfPack(attachments);
  if (pdfPack && ambiguous.length === 0 && FILING_PATTERN.test(text(message))) return true;
  if (ambiguous.length === 1 && list(attachments).length === 1) return true;
  if (uniqueMatches.length === 1 && list(attachments).length === 1 && ACTION_PATTERN.test(text(message))) return true;
  if (bank.length === 1 && universal.length === 0 && inventory.length === 0 && paidExpenses.length === 0 && vendorBills.length === 0 && purchaseOrders.length === 0) return true;
  if (inventory.length === 1 && bank.length === 0 && universal.length === 0 && paidExpenses.length === 0 && vendorBills.length === 0 && purchaseOrders.length === 0 && SIMPLE_ATTACHMENT_PATTERN.test(text(message))) return true;
  if (paidExpenses.length === 1 && bank.length === 0 && inventory.length === 0 && universal.length === 0 && vendorBills.length === 0 && purchaseOrders.length === 0) return true;
  if (vendorBills.length === 1 && bank.length === 0 && inventory.length === 0 && paidExpenses.length === 0 && universal.length === 0 && purchaseOrders.length === 0) return true;
  if (purchaseOrders.length === 1 && bank.length === 0 && inventory.length === 0 && paidExpenses.length === 0 && vendorBills.length === 0 && universal.length === 0) return true;
  return universal.length === 1 && bank.length === 0 && inventory.length === 0 && paidExpenses.length === 0 && vendorBills.length === 0 && purchaseOrders.length === 0 && SIMPLE_ATTACHMENT_PATTERN.test(text(message));
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
  const paidExpenses = paidExpenseReceiptCandidates(attachments);
  const vendorBills = vendorBillCandidates(attachments);
  const purchaseOrders = purchaseOrderCandidates(attachments);
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
  if (purchaseOrders.length === 1 && candidates.length === 0 && inventory.length === 0 && paidExpenses.length === 0 && vendorBills.length === 0 && universal.length === 0) {
    const entry = purchaseOrders[0]; const candidate = entry.candidate; const file = entry.file;
    if (candidate.status === "CLARIFICATION_REQUIRED") {
      const question = text(candidate.clarification_question) || "I need one more purchase-order detail before I can continue.";
      return { response_text: question, response_language: null, intent: "clarify", confidence: 1, agreement_state: object(agreementState), project_state: object(projectState),
        clarification: { required: true, question, options: [] }, navigation: { target_id: null }, execution: { capability_key: null, payload: {}, reason: null }, plan: [] };
    }
    if (candidate.status === "EXISTING_RECORD") {
      const existing = object(candidate.existing_record); const documentCapability = list(capabilities).find((item) => item?.key === DOCUMENT_FILE_CAPABILITY);
      if (FILING_PATTERN.test(text(message)) && documentCapability) {
        return { response_text: `This purchase order already exists as ${text(existing.label) || "an existing PO"}. I prepared the upload as controlled evidence linked to that PO; filing requires your confirmation.`, response_language: null, intent: "execute", confidence: 1,
          agreement_state: object(agreementState), project_state: object(projectState), clarification: { required: false, question: null, options: [] }, navigation: { target_id: null },
          execution: { capability_key: DOCUMENT_FILE_CAPABILITY, payload: documentCreatePayload(file, {}, existing), reason: "PREPARED_EXISTING_PURCHASE_ORDER_EVIDENCE" }, plan: [] };
      }
      return { response_text: `This purchase order already exists as ${text(existing.label) || "an existing PO"}. I have not created a duplicate.`, response_language: null, intent: "answer", confidence: 1,
        agreement_state: object(agreementState), project_state: object(projectState), clarification: { required: false, question: null, options: [] }, navigation: { target_id: null }, execution: { capability_key: null, payload: {}, reason: null }, plan: [] };
    }
    const po = object(candidate.purchase_order); const capability = list(capabilities).find((item) => item?.key === SUPPLY_CHAIN_PURCHASE_ORDER_CAPABILITY);
    if (candidate.status === "READY_FOR_REVIEW" && ACTION_PATTERN.test(text(message)) && capability && object(candidate.import_payload).supplier_party_id) {
      return { response_text: `I identified purchase order ${text(po.source_reference)} with ${list(po.items).length} line item${list(po.items).length === 1 ? "" : "s"} and prepared a new atomic Supply Chain purchase order. Avantiqo will preserve the source reference and generate its own controlled PO number. Creating it requires your confirmation.`,
        response_language: null, intent: "execute", confidence: 1, agreement_state: object(agreementState), project_state: object(projectState), clarification: { required: false, question: null, options: [] }, navigation: { target_id: null },
        execution: { capability_key: SUPPLY_CHAIN_PURCHASE_ORDER_CAPABILITY, payload: object(candidate.import_payload), reason: "PREPARED_PURCHASE_ORDER_CREATE" }, plan: [] };
    }
    return { response_text: `I identified this as purchase order ${text(po.source_reference) || "material"}. No purchase order has been created.`, response_language: null, intent: "answer", confidence: 1,
      agreement_state: object(agreementState), project_state: object(projectState), clarification: { required: false, question: null, options: [] }, navigation: { target_id: null }, execution: { capability_key: null, payload: {}, reason: null }, plan: [] };
  }

  if (vendorBills.length === 1 && candidates.length === 0 && inventory.length === 0 && paidExpenses.length === 0 && universal.length === 0) {
    const candidate = vendorBills[0].candidate;
    if (candidate.status === "CLARIFICATION_REQUIRED") {
      const question = text(candidate.clarification_question) || "I need one more supplier-invoice detail before I can create this vendor bill.";
      return { response_text: question, response_language: null, intent: "clarify", confidence: 1,
        agreement_state: object(agreementState), project_state: object(projectState),
        clarification: { required: true, question, options: [] }, navigation: { target_id: null },
        execution: { capability_key: null, payload: {}, reason: null }, plan: [] };
    }
    const bill = object(candidate.bill);
    const capability = list(capabilities).find((item) => item?.key === FINANCE_VENDOR_BILL_CAPABILITY);
    if (candidate.status === "READY_FOR_REVIEW" && ACTION_PATTERN.test(text(message)) && capability && object(candidate.import_payload).invoice_number) {
      return {
        response_text: `I identified this as an unpaid supplier invoice ${text(bill.invoice_number) || ""} and prepared the canonical Accounts Payable vendor bill${text(candidate.vendor?.vendor_code) ? ` for vendor ${text(candidate.vendor.vendor_code)}` : ""}. Creating it requires your confirmation.`,
        response_language: null, intent: "execute", confidence: 1,
        agreement_state: object(agreementState), project_state: object(projectState),
        clarification: { required: false, question: null, options: [] }, navigation: { target_id: null },
        execution: { capability_key: FINANCE_VENDOR_BILL_CAPABILITY, payload: object(candidate.import_payload), reason: "PREPARED_VENDOR_BILL_CREATE" }, plan: [] };
    }
    return { response_text: `I identified this as an unpaid supplier invoice${text(bill.invoice_number) ? ` ${text(bill.invoice_number)}` : ""}. No vendor bill has been created.`,
      response_language: null, intent: "answer", confidence: 1, agreement_state: object(agreementState), project_state: object(projectState),
      clarification: { required: false, question: null, options: [] }, navigation: { target_id: null },
      execution: { capability_key: null, payload: {}, reason: null }, plan: [] };
  }

  if (paidExpenses.length === 1 && candidates.length === 0 && inventory.length === 0 && universal.length === 0) {
    const candidate = paidExpenses[0].candidate;
    if (candidate.status === "CLARIFICATION_REQUIRED") {
      const question = text(candidate.clarification_question) || "I need one more accounting detail before I can record this paid receipt.";
      return {
        response_text: question, response_language: null, intent: "clarify", confidence: 1,
        agreement_state: object(agreementState), project_state: object(projectState),
        clarification: { required: true, question, options: [] },
        navigation: { target_id: null }, execution: { capability_key: null, payload: {}, reason: null }, plan: [],
      };
    }
    const receipt = object(candidate.receipt);
    const capability = list(capabilities).find((item) => item?.key === PAID_EXPENSE_RECEIPT_CAPABILITY);
    if (candidate.status === "READY_FOR_REVIEW" && ACTION_PATTERN.test(text(message)) && capability && object(candidate.import_payload).receipt_date) {
      return {
        response_text: `I identified this as an already-paid business expense${receipt.receipt_number ? ` (${receipt.receipt_number})` : ""} for ${text(receipt.currency_code)} ${Number(receipt.total_amount || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}. I prepared the balanced Finance posting against the verified payment source. Posting requires your confirmation and will not create an accounts-payable liability.`,
        response_language: null, intent: "execute", confidence: 1,
        agreement_state: object(agreementState), project_state: object(projectState),
        clarification: { required: false, question: null, options: [] }, navigation: { target_id: null },
        execution: { capability_key: PAID_EXPENSE_RECEIPT_CAPABILITY, payload: object(candidate.import_payload), reason: "PREPARED_PAID_EXPENSE_RECEIPT_POST" }, plan: [],
      };
    }
    return {
      response_text: `I identified this as an already-paid business expense${receipt.receipt_number ? ` (${receipt.receipt_number})` : ""}. No accounting entry has been posted.`,
      response_language: null, intent: "answer", confidence: 1,
      agreement_state: object(agreementState), project_state: object(projectState),
      clarification: { required: false, question: null, options: [] }, navigation: { target_id: null }, execution: { capability_key: null, payload: {}, reason: null }, plan: [],
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
      const assetCapability = list(capabilities).find((item) => item?.key === COMPLIANCE_ASSET_CREATE_CAPABILITY);
      const workOrderCapability = list(capabilities).find((item) => item?.key === OPERATIONS_WORK_ORDER_CREATE_CAPABILITY);
      const customerCapability = list(capabilities).find((item) => item?.key === COMMERCIAL_CUSTOMER_CREATE_CAPABILITY);
      const projectPayload = projectCreatePayload(file);
      const employeePayload = employeeCreatePayload(file);
      const assetPayload = complianceAssetCreatePayload(file, destination);
      const workOrderPayload = operationsWorkOrderPayload(file);
      const customerPayload = commercialCustomerPayload(file);
      const isCustomerDestination = text(destination.domain_id).toLowerCase() === "commercial" && text(destination.item_id).toLowerCase() === "customers";
      const isOperationsDestination = text(destination.domain_id).toLowerCase() === "operations";
      const isComplianceAssetDestination = text(destination.domain_id).toLowerCase() === "compliance" && text(destination.group_id).toLowerCase() === "assets";
      const isProjectDestination = text(destination.domain_id).toLowerCase() === "projects";
      const isPeopleEmployeeDestination = text(destination.domain_id).toLowerCase() === "people"
        && (!text(destination.item_id) || text(destination.item_id).toLowerCase() === "employees");
      if (actionRequested && isCustomerDestination && CUSTOMER_CREATE_PATTERN.test(text(message)) && customerCapability) {
        if (!customerPayload.customer_name) {
          const question = "I identified this as customer material, but I still need the customer or company name before creating the customer. What should I use?";
          return { response_text: question, response_language: null, intent: "clarify", confidence: 1, agreement_state: object(agreementState), project_state: object(projectState), clarification: { required: true, question, options: [] }, navigation: { target_id: null }, execution: { capability_key: null, payload: {}, reason: null }, plan: [] };
        }
        return {
          response_text: `I identified this as customer material for ${customerPayload.customer_name} and prepared a new Commercial customer record. Creating it requires your confirmation. Existing customers are never updated by this attachment action.`,
          response_language: null, intent: "execute", confidence: 1, agreement_state: object(agreementState), project_state: object(projectState), clarification: { required: false, question: null, options: [] }, navigation: { target_id: null },
          execution: { capability_key: COMMERCIAL_CUSTOMER_CREATE_CAPABILITY, payload: customerPayload, reason: "PREPARED_ATTACHMENT_COMMERCIAL_CUSTOMER_CREATE" }, plan: [],
        };
      }
      if (isCustomerDestination && FILING_PATTERN.test(text(message)) && documentCapability) {
        return {
          response_text: `I identified this as customer evidence and prepared it as a controlled document only. Filing does not create or update a customer. Filing requires your confirmation.`,
          response_language: null, intent: "execute", confidence: 1, agreement_state: object(agreementState), project_state: object(projectState), clarification: { required: false, question: null, options: [] }, navigation: { target_id: null },
          execution: { capability_key: DOCUMENT_FILE_CAPABILITY, payload: documentCreatePayload(file, candidate), reason: "PREPARED_COMMERCIAL_CUSTOMER_EVIDENCE_CREATE" }, plan: [],
        };
      }
      if (actionRequested && isOperationsDestination && OPERATIONS_WORK_CREATE_PATTERN.test(text(message)) && workOrderCapability) {
        if (!workOrderPayload.name) {
          const question = "I identified this as operational maintenance/service material, but I still need a work-order name or scope before creating new work. What should I use?";
          return { response_text: question, response_language: null, intent: "clarify", confidence: 1, agreement_state: object(agreementState), project_state: object(projectState), clarification: { required: true, question, options: [] }, navigation: { target_id: null }, execution: { capability_key: null, payload: {}, reason: null }, plan: [] };
        }
        return {
          response_text: `I identified this as operational work and prepared a new work order for ${workOrderPayload.name}. Creating it requires your confirmation. The uploaded file remains evidence; this does not create an asset or Finance transaction.`,
          response_language: null, intent: "execute", confidence: 1, agreement_state: object(agreementState), project_state: object(projectState), clarification: { required: false, question: null, options: [] }, navigation: { target_id: null },
          execution: { capability_key: OPERATIONS_WORK_ORDER_CREATE_CAPABILITY, payload: workOrderPayload, reason: "PREPARED_ATTACHMENT_OPERATIONS_WORK_ORDER_CREATE" }, plan: [],
        };
      }
      if (isOperationsDestination && FILING_PATTERN.test(text(message)) && documentCapability) {
        return {
          response_text: `I identified this as Operations evidence and prepared it as a controlled document. This does not create new operational work. Filing requires your confirmation.`,
          response_language: null, intent: "execute", confidence: 1, agreement_state: object(agreementState), project_state: object(projectState), clarification: { required: false, question: null, options: [] }, navigation: { target_id: null },
          execution: { capability_key: DOCUMENT_FILE_CAPABILITY, payload: documentCreatePayload(file, candidate), reason: "PREPARED_OPERATIONS_CONTROLLED_DOCUMENT_CREATE" }, plan: [],
        };
      }
      if (actionRequested && isComplianceAssetDestination && ASSET_CREATE_PATTERN.test(text(message)) && assetCapability) {
        if (!text(entityId)) {
          const question = "Which legal entity owns or controls this asset?";
          return { response_text: question, response_language: null, intent: "clarify", confidence: 1, agreement_state: object(agreementState), project_state: object(projectState), clarification: { required: true, question, options: [] }, navigation: { target_id: null }, execution: { capability_key: null, payload: {}, reason: null }, plan: [] };
        }
        if (!assetPayload.asset_code || !assetPayload.name) {
          const missing = [!assetPayload.asset_code ? "asset code" : null, !assetPayload.name ? "asset name" : null].filter(Boolean).join(" and ");
          const question = `I identified this as ${assetPayload.asset_type.toLowerCase().replace("_", " ")} material, but I still need the ${missing} before I can register the asset. What should I use?`;
          return { response_text: question, response_language: null, intent: "clarify", confidence: 1, agreement_state: object(agreementState), project_state: object(projectState), clarification: { required: true, question, options: [] }, navigation: { target_id: null }, execution: { capability_key: null, payload: {}, reason: null }, plan: [] };
        }
        return {
          response_text: `I identified this as ${assetPayload.asset_type.toLowerCase().replace("_", " ")} ${assetPayload.name} and prepared it for the Compliance asset register. Creating it requires your confirmation. This does not create or change a Finance fixed asset or depreciation record.`,
          response_language: null, intent: "execute", confidence: 1, agreement_state: object(agreementState), project_state: object(projectState),
          clarification: { required: false, question: null, options: [] }, navigation: { target_id: null },
          execution: { capability_key: COMPLIANCE_ASSET_CREATE_CAPABILITY, payload: assetPayload, reason: "PREPARED_ATTACHMENT_COMPLIANCE_ASSET_CREATE" }, plan: [],
        };
      }
      if (isComplianceAssetDestination && FILING_PATTERN.test(text(message)) && documentCapability) {
        return {
          response_text: `I identified this as Compliance asset evidence and prepared it as a controlled document only. Filing it does not create an asset or any Finance/depreciation record. Filing requires your confirmation.`,
          response_language: null, intent: "execute", confidence: 1, agreement_state: object(agreementState), project_state: object(projectState), clarification: { required: false, question: null, options: [] }, navigation: { target_id: null },
          execution: { capability_key: DOCUMENT_FILE_CAPABILITY, payload: documentCreatePayload(file, candidate), reason: "PREPARED_COMPLIANCE_ASSET_EVIDENCE_CREATE" }, plan: [],
        };
      }
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
