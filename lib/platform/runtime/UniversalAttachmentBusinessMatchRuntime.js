import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MATCH_CONTRACT = "AVANTIQO_UNIVERSAL_ATTACHMENT_BUSINESS_MATCH_V1";

function text(value, limit = 500) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) { return Array.isArray(value) ? value : []; }
function normalized(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
function unique(values) {
  return [...new Set(values.map((value) => text(value)).filter(Boolean))];
}
function evidence(file = {}) {
  return object(object(file.analysis).evidence);
}
function flattenedEvidence(file = {}) {
  const source = evidence(file);
  return {
    ...object(source.key_fields),
    ...object(source.identifiers),
    ...source,
  };
}
function value(source, names) {
  const indexed = new Map(Object.entries(object(source)).map(([key, entry]) => [normalized(key), entry]));
  for (const name of names) {
    const found = indexed.get(normalized(name));
    if (text(found)) return text(found);
  }
  return null;
}
function baseResult(status, extras = {}) {
  return {
    contract: MATCH_CONTRACT,
    status,
    confidence: 0,
    match_basis: [],
    candidates: [],
    clarification_required: status === "AMBIGUOUS_MATCH",
    clarification_question: null,
    authorization_effect: "NONE",
    ...extras,
  };
}
function candidate(type, row, label, basis) {
  return {
    record_type: type,
    record_id: text(row?.id, 160),
    label: text(label, 300) || type,
    match_basis: unique(basis),
  };
}
function statusFromCandidates(candidates, basis) {
  if (!candidates.length) return baseResult("NO_MATCH", { match_basis: unique(basis) });
  if (candidates.length === 1) {
    return baseResult("UNIQUE_MATCH", {
      confidence: 1,
      match_basis: unique(basis),
      candidates,
      clarification_required: false,
    });
  }
  return baseResult("AMBIGUOUS_MATCH", {
    confidence: 0.5,
    match_basis: unique(basis),
    candidates: candidates.slice(0, 8),
    clarification_required: true,
    clarification_question: "I found more than one existing record matching this evidence. Which one should I use?",
  });
}

async function matchControlledDocument({ file, organizationId, entityId }) {
  const sha = text(file.sha256, 128);
  if (!sha) return null;
  let query = supabaseAdmin.from("enterprise_documents")
    .select("id,document_name,document_number,document_type,entity_id,checksum_sha256")
    .eq("organization_id", organizationId)
    .eq("checksum_sha256", sha)
    .limit(8);
  if (entityId) query = query.eq("entity_id", entityId);
  const { data, error } = await query;
  if (error) throw error;
  if (!data?.length) return null;
  return statusFromCandidates(
    data.map((row) => candidate("enterprise_document", row, row.document_number || row.document_name, ["checksum_sha256"])),
    ["checksum_sha256"],
  );
}
async function matchCustomerInvoice({ fields, organizationId, entityId }) {
  const invoiceNumber = value(fields, ["invoice_number", "invoice_no", "document_number"]);
  if (!invoiceNumber || !entityId) return null;
  const { data, error } = await supabaseAdmin.from("customer_invoices")
    .select("id,invoice_number,invoice_date,total_amount,currency_code,status,party_id")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("invoice_number", invoiceNumber)
    .limit(8);
  if (error) throw error;
  return statusFromCandidates(
    (data || []).map((row) => candidate("customer_invoice", row, row.invoice_number, ["invoice_number", "entity_id"])),
    ["invoice_number", "entity_id"],
  );
}

async function matchInventoryItem({ fields, organizationId, entityId }) {
  const code = value(fields, ["sku", "item_code", "product_code", "code"]);
  if (!code) return null;
  let query = supabaseAdmin.from("inventory_items")
    .select("id,name,code,entity_id,is_active")
    .eq("organization_id", organizationId)
    .eq("code", code)
    .limit(8);
  if (entityId) query = query.eq("entity_id", entityId);
  const { data, error } = await query;
  if (error) throw error;
  return statusFromCandidates(
    (data || []).map((row) => candidate("inventory_item", row, row.code || row.name, ["item_code"])),
    ["item_code"],
  );
}

async function matchOperationsWorkOrder({ fields, organizationId, entityId }) {
  const code = value(fields, ["work_order_code", "work_order_number", "work_order_reference", "job_number", "service_order_number", "service_reference"]);
  if (!code) return null;
  let query = supabaseAdmin.from("operations_records")
    .select("id,capability_id,code,name,entity_id,status")
    .eq("organization_id", organizationId)
    .eq("capability_id", "work-orders")
    .eq("code", code)
    .limit(8);
  if (entityId) query = query.eq("entity_id", entityId);
  const { data, error } = await query;
  if (error) throw error;
  return statusFromCandidates(
    (data || []).map((row) => candidate("operations_work_order", row, row.code || row.name, ["work_order_reference", ...(entityId ? ["entity_id"] : [])])),
    ["work_order_reference", ...(entityId ? ["entity_id"] : [])],
  );
}

async function matchComplianceAsset({ fields, organizationId, entityId }) {
  if (!entityId) return null;
  const code = value(fields, ["asset_code", "equipment_code", "vehicle_code", "property_code", "code"]);
  const serial = value(fields, ["serial_number", "serial_no", "serial"]);
  const registration = value(fields, ["registration_number", "registration_no", "license_plate", "plate_number"]);
  const reference = value(fields, ["reference_identifier", "domain", "domain_name", "property_reference", "asset_reference"]);
  const matchValue = code || serial || registration || reference;
  if (!matchValue) return null;
  let query = supabaseAdmin.from("compliance_assets")
    .select("id,asset_type,asset_code,name,entity_id,serial_number,registration_number,reference_identifier,status")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .limit(8);
  let basis = "asset_code";
  if (code) query = query.eq("asset_code", code);
  else if (serial) { query = query.eq("serial_number", serial); basis = "serial_number"; }
  else if (registration) { query = query.eq("registration_number", registration); basis = "registration_number"; }
  else { query = query.eq("reference_identifier", reference); basis = "reference_identifier"; }
  const { data, error } = await query;
  if (error) {
    if (String(error.message || "").includes("compliance_assets")) return null;
    throw error;
  }
  return statusFromCandidates(
    (data || []).map((row) => candidate("compliance_asset", row, row.asset_code || row.name, [basis, "entity_id"])),
    [basis, "entity_id"],
  );
}

async function matchProject({ fields, organizationId, entityId }) {
  const code = value(fields, ["project_code", "project_number", "project_id", "code"]);
  if (!code) return null;
  let query = supabaseAdmin.from("projects")
    .select("id,code,name,entity_id,status")
    .eq("organization_id", organizationId)
    .eq("code", code)
    .limit(8);
  if (entityId) query = query.eq("entity_id", entityId);
  const { data, error } = await query;
  if (error) throw error;
  return statusFromCandidates(
    (data || []).map((row) => candidate("project", row, row.code || row.name, ["project_code"])),
    ["project_code"],
  );
}
async function matchEmployee({ fields, organizationId }) {
  const email = value(fields, ["employee_email", "email", "work_email"]);
  const taxId = value(fields, ["employee_tax_id", "tax_id"]);
  if (!email && !taxId) return null;
  let query = supabaseAdmin.from("staff_accounts")
    .select("id,name,email,tax_id,active,active_organization_id")
    .limit(20);
  query = email ? query.eq("email", email) : query.eq("tax_id", taxId);
  const { data: staff, error } = await query;
  if (error) throw error;
  const ids = (staff || []).map((row) => row.id).filter(Boolean);
  if (!ids.length) return baseResult("NO_MATCH", { match_basis: [email ? "employee_email" : "employee_tax_id"] });
  const { data: memberships, error: membershipError } = await supabaseAdmin.from("organization_users")
    .select("staff_account_id,status")
    .eq("organization_id", organizationId)
    .in("staff_account_id", ids);
  if (membershipError) throw membershipError;
  const memberIds = new Set((memberships || []).filter((row) => !["inactive","disabled","suspended","terminated","archived"].includes(normalized(row.status))).map((row) => row.staff_account_id));
  const scoped = (staff || []).filter((row) => memberIds.has(row.id) || text(row.active_organization_id, 160) === organizationId);
  return statusFromCandidates(
    scoped.map((row) => candidate("employee", row, row.name || row.email, [email ? "employee_email" : "employee_tax_id", "organization_membership"])),
    [email ? "employee_email" : "employee_tax_id", "organization_membership"],
  );
}

async function matchDocumentNumber({ fields, organizationId, entityId }) {
  const number = value(fields, ["document_number", "contract_number", "certificate_number", "reference_number"]);
  if (!number) return null;
  let query = supabaseAdmin.from("enterprise_documents")
    .select("id,document_name,document_number,document_type,entity_id")
    .eq("organization_id", organizationId)
    .eq("document_number", number)
    .limit(8);
  if (entityId) query = query.eq("entity_id", entityId);
  const { data, error } = await query;
  if (error) throw error;
  return statusFromCandidates(
    (data || []).map((row) => candidate("enterprise_document", row, row.document_number || row.document_name, ["document_number"])),
    ["document_number"],
  );
}
function semanticKind(file = {}) {
  const source = evidence(file);
  return normalized(source.document_type || source.object_type || "");
}
function domains(file = {}) {
  return list(object(file.analysis).candidate_domains).map(normalized).filter(Boolean);
}

export async function matchAnalyzedAttachmentToBusiness({ file = {}, organizationId, entityId = null } = {}) {
  if (!organizationId) throw new Error("organizationId required");
  if (object(file.analysis).status !== "ANALYZED") return baseResult("NOT_SUPPORTED");

  const exactDocument = await matchControlledDocument({ file, organizationId, entityId });
  if (exactDocument) return exactDocument;

  const fields = flattenedEvidence(file);
  const kind = semanticKind(file);
  const candidateDomains = domains(file);
  const attempts = [];

  if (/invoice/.test(kind) && !/supplier|vendor|expense|receipt/.test(kind)) {
    attempts.push(() => matchCustomerInvoice({ fields, organizationId, entityId }));
  }
  if (candidateDomains.includes("supply_chain") || /inventory|stock|sku|product/.test(kind)) {
    attempts.push(() => matchInventoryItem({ fields, organizationId, entityId }));
  }
  if (candidateDomains.includes("projects") || /project|drawing|specification/.test(kind)) {
    attempts.push(() => matchProject({ fields, organizationId, entityId }));
  }
  if (candidateDomains.includes("operations") || /maintenance|service_report|work_order|repair|inspection_report/.test(kind)) {
    attempts.push(() => matchOperationsWorkOrder({ fields, organizationId, entityId }));
  }
  if (candidateDomains.includes("compliance") || /asset|equipment|vehicle|property|digital_asset|domain|ssl/.test(kind)) {
    attempts.push(() => matchComplianceAsset({ fields, organizationId, entityId }));
  }
  if (candidateDomains.includes("people") || /employee|staff|certificate|cv|resume/.test(kind)) {
    attempts.push(() => matchEmployee({ fields, organizationId }));
  }
  if (candidateDomains.includes("documents") || /contract|agreement|certificate|document/.test(kind)) {
    attempts.push(() => matchDocumentNumber({ fields, organizationId, entityId }));
  }

  const supportedResults = [];
  for (const attempt of attempts) {
    const result = await attempt();
    if (result && result.status !== "NO_MATCH" && result.status !== "NOT_SUPPORTED") supportedResults.push(result);
  }
  if (!supportedResults.length) {
    return attempts.length ? baseResult("NO_MATCH") : baseResult("NOT_SUPPORTED");
  }
  const uniqueCandidates = supportedResults.flatMap((result) => result.candidates || []);
  if (supportedResults.length === 1) return supportedResults[0];
  return baseResult("AMBIGUOUS_MATCH", {
    confidence: 0.5,
    match_basis: unique(supportedResults.flatMap((result) => result.match_basis || [])),
    candidates: uniqueCandidates.slice(0, 8),
    clarification_required: true,
    clarification_question: "This upload strongly matches more than one existing business record. Which record should I use?",
  });
}

export default matchAnalyzedAttachmentToBusiness;
