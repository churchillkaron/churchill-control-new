const CONTRACT = "AVANTIQO_SUPPLIER_ATTACHMENT_PREPARATION_V1";

const text = (value, limit = 1000) => String(value ?? "").trim().slice(0, limit);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const normalized = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");

function evidence(file = {}) { return object(object(file.analysis).evidence); }
function fields(file = {}) {
  const source = evidence(file);
  return { ...object(source.key_fields), ...object(source.identifiers), ...source };
}
function value(source, names) {
  const index = new Map(Object.entries(object(source)).map(([key, entry]) => [normalized(key), entry]));
  for (const name of names) {
    const found = index.get(normalized(name));
    if (text(found)) return text(found);
  }
  return null;
}
function supplierLike(file = {}) {
  const source = evidence(file);
  const kind = normalized(`${source.document_type || ""} ${source.object_type || ""}`);
  return /supplier|vendor/.test(kind) && !/invoice|bill|purchase_order|purchase order|delivery_note|goods_receipt/.test(kind);
}
export async function prepareSupplierAttachment({ file = {}, organizationId } = {}) {
  if (!organizationId) throw new Error("organizationId required");
  if (object(file.analysis).status !== "ANALYZED" || !supplierLike(file)) {
    return { contract: CONTRACT, recognized: false, authorization_effect: "NONE" };
  }

  const match = object(file.business_match);
  if (match.status === "AMBIGUOUS_MATCH") {
    return { contract: CONTRACT, recognized: true, status: "CLARIFICATION_REQUIRED",
      clarification_required: true,
      clarification_question: text(match.clarification_question) || "Which existing supplier should I use?",
      authorization_effect: "NONE" };
  }
  if (match.status === "UNIQUE_MATCH" && list(match.candidates).some((item) => item?.record_type === "supplier")) {
    return { contract: CONTRACT, recognized: true, status: "EXISTING_RECORD",
      existing_record: list(match.candidates)[0], authorization_effect: "NONE" };
  }

  const source = fields(file);
  const legalName = value(source,["supplier_legal_name","vendor_legal_name","legal_name","company_name","supplier_name","vendor_name"]);
  const vendorCode = value(source,["vendor_code","supplier_code","vendor_number","supplier_number"]);
  const taxId = value(source,["supplier_tax_id","vendor_tax_id","tax_id","tax_number","vat_number"]);
  const email = value(source,["supplier_email","vendor_email","email","contact_email"]);
  const strong = vendorCode || taxId || email;
  let question = null;
  if (!legalName) question = "What is the supplier's legal name?";
  else if (!strong) question = "What supplier code, tax ID, or email should I use to identify this supplier uniquely?";

  return {
    contract: CONTRACT, recognized: true,
    status: question ? "CLARIFICATION_REQUIRED" : "READY_FOR_REVIEW",
    clarification_required: Boolean(question), clarification_question: question,
    supplier: { legal_name: legalName, vendor_code: vendorCode, tax_id: taxId, email },
    import_payload: question ? null : {
      legal_name: legalName, display_name: value(source,["display_name","supplier_name","vendor_name","company_name"]) || legalName,
      vendor_code: vendorCode || null, tax_id: taxId || null, email: email ? email.toLowerCase() : null,
      phone: value(source,["supplier_phone","vendor_phone","phone","contact_phone"]) || null,
      address: value(source,["supplier_address","vendor_address","address"]) || null,
      payment_terms: value(source,["payment_terms","credit_terms"]) || null,
      notes: value(source,["notes","summary"]) || null,
      source_attachment_sha256: text(file.sha256,128) || null,
    }, authorization_effect: "NONE",
  };
}

export default prepareSupplierAttachment;
