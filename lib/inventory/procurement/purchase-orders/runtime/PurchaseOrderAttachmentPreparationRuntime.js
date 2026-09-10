const CONTRACT = "AVANTIQO_PURCHASE_ORDER_ATTACHMENT_PREPARATION_V1";
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
function purchaseOrderLike(file = {}) {
  const e = evidence(file); const kind = normalized(`${e.document_type || ""} ${e.object_type || ""}`);
  return /purchase_order|supplier_purchase_order|po_document/.test(kind);
}
function normalizeItems(source = {}) {
  const rows = list(value(source, ["line_items", "items", "lines"]));
  return rows.map((entry, index) => {
    const row = object(entry); const qty = Number(row.qty ?? row.quantity ?? 0); const price = Number(row.unit_price ?? row.price ?? 0);
    return {
      item_id: text(row.item_id, 80) || null,
      item_name: text(row.item_name || row.name || row.description || row.item || `Purchase item ${index + 1}`, 500),
      qty: Number.isFinite(qty) ? qty : 0,
      unit_price: Number.isFinite(price) ? price : 0,
    };
  });
}
export async function preparePurchaseOrderAttachment({ file = {}, organizationId, entityId } = {}) {
  if (!organizationId) throw new Error("organizationId required");
  if (object(file.analysis).status !== "ANALYZED" || !purchaseOrderLike(file)) return { contract: CONTRACT, recognized: false, authorization_effect: "NONE" };
  if (!entityId) return { contract: CONTRACT, recognized: true, status: "CLARIFICATION_REQUIRED", clarification_required: true,
    clarification_question: "Which legal entity owns this purchase order?", authorization_effect: "NONE" };
  const match = object(file.business_match);
  if (match.status === "UNIQUE_MATCH" && match.candidates?.[0]?.record_type === "purchase_order") {
    return { contract: CONTRACT, recognized: true, status: "EXISTING_RECORD", existing_record: match.candidates[0], clarification_required: false, authorization_effect: "NONE" };
  }
  const supplier = match.status === "UNIQUE_MATCH" && match.candidates?.[0]?.record_type === "supplier" ? match.candidates[0] : null;
  if (!supplier) return { contract: CONTRACT, recognized: true, status: "CLARIFICATION_REQUIRED", clarification_required: true,
    clarification_question: "I can identify this as a purchase order, but I cannot match the supplier exactly. Which existing supplier should I use?", authorization_effect: "NONE" };
  const source = fields(file);
  const reference = text(value(source, ["purchase_order_number", "po_number", "purchase_order_reference", "order_number", "source_reference"]), 160) || null;
  const currency = text(value(source, ["currency", "currency_code"]), 12).toUpperCase() || null;
  const expected = text(value(source, ["expected_delivery_date", "delivery_date", "due_date"]), 20) || null;
  const items = normalizeItems(source);
  if (!reference) return { contract: CONTRACT, recognized: true, status: "CLARIFICATION_REQUIRED", clarification_required: true,
    clarification_question: "What source purchase-order number or reference should I preserve for this document?", authorization_effect: "NONE" };
  if (!currency) return { contract: CONTRACT, recognized: true, status: "CLARIFICATION_REQUIRED", clarification_required: true,
    clarification_question: "What currency should I use for this purchase order?", authorization_effect: "NONE" };
  if (!items.length || items.some((row) => !(row.qty > 0) || row.unit_price < 0 || !row.item_name)) {
    return { contract: CONTRACT, recognized: true, status: "CLARIFICATION_REQUIRED", clarification_required: true,
      clarification_question: "I could not verify all purchase-order item quantities and prices. Which line items should I use?", authorization_effect: "NONE" };
  }
  return { contract: CONTRACT, recognized: true, status: "READY_FOR_REVIEW", clarification_required: false,
    purchase_order: { source_reference: reference, currency, expected_delivery_date: expected, supplier_party_id: supplier.record_id, items },
    import_payload: { supplier_party_id: supplier.record_id, items, currency, expected_delivery_date: expected,
      notes: `Imported from Business Partner attachment ${reference}`, source_reference: reference, source_attachment_sha256: text(file.sha256, 128) || null },
    authorization_effect: "NONE" };
}
export default preparePurchaseOrderAttachment;
