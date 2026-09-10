import { resolveBaseUnitCost } from "@/lib/inventory/costing/InventoryUomCostRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CONTRACT = "AVANTIQO_VENDOR_BILL_ATTACHMENT_PREPARATION_V1";
const text = (value, limit = 1000) => String(value ?? "").trim().slice(0, limit);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const normalized = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

function evidence(file = {}) { return object(object(file.analysis).evidence); }
function fields(file = {}) { const e = evidence(file); return { ...object(e.key_fields), ...object(e.identifiers), ...e }; }
function value(source, names) {
  const index = new Map(Object.entries(object(source)).map(([key, entry]) => [normalized(key), entry]));
  for (const name of names) { const found = index.get(normalized(name)); if (found !== undefined && found !== null && found !== "") return found; }
  return null;
}
function numberValue(source, names) { const n = Number(value(source, names)); return Number.isFinite(n) ? n : null; }
function paymentStatus(source) {
  const status = normalized(value(source, ["payment_status", "paid_status", "status"]));
  if (["paid", "settled", "completed"].includes(status)) return "PAID";
  if (["unpaid", "open", "due", "payable"].includes(status)) return "UNPAID";
  return "UNKNOWN";
}
function supplierInvoiceLike(file = {}) {
  const e = evidence(file); const kind = normalized(`${e.document_type || ""} ${e.object_type || ""}`);
  const f = fields(file);
  return /supplier|vendor/.test(kind) && /invoice|bill/.test(kind)
    || (/invoice|bill/.test(kind) && Boolean(value(f, ["supplier_name", "vendor_name", "supplier_tax_id", "vendor_tax_id", "vendor_code"])));
}

async function resolveSupplier({ file, organizationId }) {
  const match = object(file.business_match);
  if (match.status === "UNIQUE_MATCH" && match.candidates?.[0]?.record_type === "supplier") {
    const partyId = text(match.candidates[0].record_id, 80);
    const profile = await supabaseAdmin.from("supplier_profiles")
      .select("id,party_id,vendor_code,default_expense_account,default_ap_account,is_active,is_blocked")
      .eq("organization_id", organizationId).eq("party_id", partyId).maybeSingle();
    if (profile.error) throw profile.error;
    if (profile.data?.is_active !== false && profile.data?.is_blocked !== true) return profile.data;
  }
  return null;
}

function rawLines(source = {}) {
  const rows = list(value(source, ["line_items", "items", "lines"]));
  if (rows.length) return rows.map((entry, index) => {
    const row = object(entry); const quantity = Number(row.quantity ?? row.qty ?? 1); const unitPrice = Number(row.unit_price ?? row.price ?? row.net_amount ?? row.amount ?? 0);
    const discount = Number(row.discount_amount ?? row.discount ?? 0); const tax = Number(row.tax_amount ?? row.vat_amount ?? row.tax ?? 0);
    return { description: text(row.description || row.name || row.item || `Supplier invoice line ${index + 1}`), quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      unit_price: Number.isFinite(unitPrice) ? unitPrice : 0, discount_amount: Number.isFinite(discount) ? discount : 0,
      tax_amount: Number.isFinite(tax) ? tax : 0, tax_code: text(row.tax_code || row.vat_code, 80) || null,
      expense_account_id: text(row.expense_account_id, 80) || null, cost_center_id: text(row.cost_center_id, 80) || null,
      department_id: text(row.department_id, 80) || null, project_id: text(row.project_id, 80) || null,
      item_code: text(row.item_code || row.sku || row.product_code || row.code, 160) || null,
      source_uom_text: text(row.uom || row.unit || row.unit_of_measure || row.purchase_unit, 80) || null };
  });
  const total = numberValue(source, ["total_amount", "amount", "gross_amount", "total"]); const tax = numberValue(source, ["tax_amount", "vat_amount", "tax"]) || 0;
  if (!(total > 0)) return [];
  return [{ description: text(value(source, ["description", "supplier_name", "vendor_name"])) || "Supplier invoice",
    quantity: 1, unit_price: Math.max(0, total - tax), discount_amount: 0, tax_amount: tax,
    tax_code: text(value(source, ["tax_code", "vat_code"]), 80) || null, expense_account_id: null, cost_center_id: null, department_id: null, project_id: null }];
}

async function resolveTaxCode({ organizationId, invoiceDate, line }) {
  if (!(Number(line.tax_amount) > 0)) return null;
  const taxCode = text(line.tax_code, 80); if (!taxCode) return null;
  let query = supabaseAdmin.from("tax_rules").select("id,tax_code,tax_rate,tax_type,effective_from,effective_to,is_active,organization_id")
    .eq("tax_code", taxCode).eq("is_active", true).or(`organization_id.eq.${organizationId},organization_id.is.null`);
  const result = await query; if (result.error) throw result.error;
  const applicable = (result.data || []).filter((row) => (!row.effective_from || invoiceDate >= row.effective_from) && (!row.effective_to || invoiceDate <= row.effective_to));
  return applicable.length === 1 ? applicable[0].id : null;
}

export async function prepareVendorBillAttachment({ file = {}, organizationId, entityId } = {}) {
  if (!organizationId) throw new Error("organizationId required");
  if (object(file.analysis).status !== "ANALYZED" || !supplierInvoiceLike(file)) return { contract: CONTRACT, recognized: false, authorization_effect: "NONE" };
  const source = fields(file); const paid = paymentStatus(source);
  if (paid === "PAID") return { contract: CONTRACT, recognized: false, paid_expense_candidate: true, payment_status: paid, authorization_effect: "NONE" };
  if (!entityId) return { contract: CONTRACT, recognized: true, status: "CLARIFICATION_REQUIRED", clarification_required: true, clarification_question: "Which legal entity received this supplier invoice?", authorization_effect: "NONE" };
  if (paid === "UNKNOWN") return { contract: CONTRACT, recognized: true, status: "CLARIFICATION_REQUIRED", clarification_required: true, clarification_question: "Has this supplier invoice already been paid, or is it still payable to the supplier?", authorization_effect: "NONE" };

  const supplier = await resolveSupplier({ file, organizationId });
  if (!supplier) return { contract: CONTRACT, recognized: true, status: "CLARIFICATION_REQUIRED", clarification_required: true,
    clarification_question: "I can identify this as an unpaid supplier invoice, but I cannot match the supplier exactly to an existing vendor. Should I create the supplier first?", authorization_effect: "NONE" };

  const invoiceNumber = text(value(source, ["supplier_invoice_number", "vendor_invoice_number", "invoice_or_receipt_number", "invoice_number", "invoice_no", "document_number"]), 160) || null;
  const invoiceDate = text(value(source, ["invoice_date", "transaction_date", "date"]), 20) || null;
  const currency = text(value(source, ["currency_code", "currency"]), 12).toUpperCase() || null;
  const dueDate = text(value(source, ["due_date", "payment_due_date"]), 20) || null;
  const lines = rawLines(source).map((line) => ({ ...line, expense_account_id: line.expense_account_id || supplier.default_expense_account || null }));
  if (!invoiceNumber) return { contract: CONTRACT, recognized: true, status: "CLARIFICATION_REQUIRED", clarification_required: true, clarification_question: "What supplier invoice number should I use?", authorization_effect: "NONE" };
  if (!invoiceDate) return { contract: CONTRACT, recognized: true, status: "CLARIFICATION_REQUIRED", clarification_required: true, clarification_question: "What invoice date should I use for this supplier bill?", authorization_effect: "NONE" };
  if (!currency) return { contract: CONTRACT, recognized: true, status: "CLARIFICATION_REQUIRED", clarification_required: true, clarification_question: "What currency should I use for this supplier bill?", authorization_effect: "NONE" };
  if (!lines.length || lines.some((line) => !(line.quantity > 0) || line.unit_price < 0)) return { contract: CONTRACT, recognized: true, status: "CLARIFICATION_REQUIRED", clarification_required: true, clarification_question: "I could not verify the supplier invoice line amounts. What line items should I record?", authorization_effect: "NONE" };
  if (lines.some((line) => !line.expense_account_id)) return { contract: CONTRACT, recognized: true, status: "CLARIFICATION_REQUIRED", clarification_required: true, clarification_question: "Which expense, asset, or inventory account should I use for this supplier invoice?", authorization_effect: "NONE" };

  const normalizedLines = [];
  for (const line of lines) {
    const taxCodeId = await resolveTaxCode({ organizationId, invoiceDate, line });
    if (line.tax_amount > 0 && !taxCodeId) return { contract: CONTRACT, recognized: true, status: "CLARIFICATION_REQUIRED", clarification_required: true,
      clarification_question: "This supplier invoice contains tax, but I cannot resolve one exact applicable tax rule. Which tax treatment should I use?", authorization_effect: "NONE" };
    const netUnitPrice = line.quantity > 0 ? ((line.quantity * line.unit_price) - line.discount_amount) / line.quantity : line.unit_price;
    const costEvidence = line.item_code && line.source_uom_text
      ? await resolveBaseUnitCost({ organizationId, entityId, itemCode: line.item_code, sourceUomToken: line.source_uom_text, unitPrice: netUnitPrice })
      : { status: "NOT_APPLICABLE" };
    normalizedLines.push({ description: line.description, quantity: line.quantity, unit_price: line.unit_price, discount_amount: line.discount_amount,
      tax_code_id: taxCodeId, tax_amount: line.tax_amount, line_total: line.quantity * line.unit_price - line.discount_amount + line.tax_amount,
      item_id: costEvidence.status === "RESOLVED" ? costEvidence.item_id : null,
      source_item_code: line.item_code, source_uom_text: line.source_uom_text,
      uom_id: costEvidence.status === "RESOLVED" ? costEvidence.source_uom_id : null,
      factor_to_item_base: costEvidence.status === "RESOLVED" ? costEvidence.factor_to_item_base : null,
      base_unit_cost: costEvidence.status === "RESOLVED" ? costEvidence.base_unit_cost : null,
      cost_evidence_status: costEvidence.status,
      expense_account_id: line.expense_account_id, asset_account_id: null, inventory_account_id: null,
      cost_center_id: line.cost_center_id, department_id: line.department_id, project_id: line.project_id,
      purchase_order_item_id: null, goods_receipt_item_id: null });
  }

  return { contract: CONTRACT, recognized: true, status: "READY_FOR_REVIEW", clarification_required: false,
    vendor: { party_id: supplier.party_id, vendor_code: supplier.vendor_code || null },
    bill: { invoice_number: invoiceNumber, invoice_date: invoiceDate, due_date: dueDate, currency_code: currency, lines: normalizedLines },
    import_payload: { vendor_party_id: supplier.party_id, invoice_number: invoiceNumber, invoice_date: invoiceDate, due_date: dueDate,
      currency_code: currency, exchange_rate: 1, source_attachment_sha256: text(file.sha256, 128) || null,
      ocr_confidence: Number(evidence(file).confidence || object(file.analysis).confidence || 0), lines: normalizedLines },
    authorization_effect: "NONE" };
}
export default prepareVendorBillAttachment;
