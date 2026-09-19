import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const text = (value, limit = 300) => String(value ?? "").trim().slice(0, limit);
const upper = (value) => text(value).toUpperCase();
const normalizeRef = (value) => upper(value).replace(/[^A-Z0-9]/g, "");
const list = (value) => Array.isArray(value) ? value : [];
const CLOSED_PO_STATUSES = new Set(["DRAFT", "CANCELLED", "CANCELED", "VOID", "VOIDED", "REJECTED", "CLOSED"]);
const CLOSED_RECEIPT_STATUSES = new Set(["DRAFT", "CANCELLED", "CANCELED", "VOID", "VOIDED", "REJECTED"]);

function explicitPoReference(source = {}) {
  for (const key of ["purchase_order_number", "po_number", "purchase_order", "order_number", "po_reference", "purchase_order_reference"]) {
    const value = text(source?.[key], 160);
    if (value) return value;
  }
  return null;
}

async function resolveItemIds({ organizationId, entityId, lines }) {
  const unresolvedCodes = [...new Set(lines
    .filter((line) => !line.item_id && text(line.source_item_code, 160))
    .map((line) => text(line.source_item_code, 160)))];
  if (!unresolvedCodes.length) return lines;
  const { data, error } = await supabaseAdmin.from("inventory_items")
    .select("id,code,is_active")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .in("code", unresolvedCodes);
  if (error) throw error;
  const byCode = new Map();
  for (const row of data || []) {
    if (row.is_active === false) continue;
    const key = upper(row.code);
    const rows = byCode.get(key) || [];
    rows.push(row);
    byCode.set(key, rows);
  }
  return lines.map((line) => {
    if (line.item_id || !line.source_item_code) return line;
    const matches = byCode.get(upper(line.source_item_code)) || [];
    return matches.length === 1 ? { ...line, item_id: matches[0].id } : line;
  });
}

export async function resolveVendorBillProcurementEvidence({ organizationId, entityId, vendorPartyId, source = {}, lines = [] } = {}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!entityId) throw new Error("entityId required");
  if (!vendorPartyId) throw new Error("vendorPartyId required");
  const poReference = explicitPoReference(source);
  if (!poReference) {
    return { status: "NOT_REFERENCED", purchase_order_reference: null, purchase_order_id: null, goods_receipt_id: null, lines, touchless_eligible: false, blocker: null };
  }

  const { data: purchaseOrders, error: poError } = await supabaseAdmin.from("purchase_orders")
    .select("id,po_number,supplier_party_id,status,currency,total_amount,entity_id")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("supplier_party_id", vendorPartyId);
  if (poError) throw poError;
  const exactPo = (purchaseOrders || []).filter((row) => !CLOSED_PO_STATUSES.has(upper(row.status)) && normalizeRef(row.po_number) === normalizeRef(poReference));
  if (!exactPo.length) return { status: "PO_NOT_FOUND", purchase_order_reference: poReference, touchless_eligible: false, blocker: `Purchase order ${poReference} was not found for this supplier and legal entity.` };
  if (exactPo.length > 1) return { status: "PO_AMBIGUOUS", purchase_order_reference: poReference, touchless_eligible: false, blocker: `Purchase order ${poReference} is ambiguous in this supplier and legal-entity scope.` };
  const po = exactPo[0];

  const { data: receipts, error: receiptError } = await supabaseAdmin.from("goods_receipts")
    .select("id,grn_number,purchase_order_id,supplier_party_id,status,received_date")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("purchase_order_id", po.id)
    .eq("supplier_party_id", vendorPartyId);
  if (receiptError) throw receiptError;
  const eligibleReceipts = (receipts || []).filter((row) => !CLOSED_RECEIPT_STATUSES.has(upper(row.status)));
  if (!eligibleReceipts.length) return { status: "RECEIPT_REQUIRED", purchase_order_reference: poReference, purchase_order_id: po.id, goods_receipt_id: null, lines, touchless_eligible: false, blocker: `Purchase order ${poReference} is valid, but no eligible goods receipt exists yet.` };
  if (eligibleReceipts.length > 1) return { status: "RECEIPT_AMBIGUOUS", purchase_order_reference: poReference, purchase_order_id: po.id, goods_receipt_id: null, lines, touchless_eligible: false, blocker: `Purchase order ${poReference} has multiple goods receipts. Select the exact receipt before matching this invoice.` };
  const receipt = eligibleReceipts[0];

  const [poItemsResult, receiptItemsResult] = await Promise.all([
    supabaseAdmin.from("purchase_order_items").select("id,purchase_order_id,item_id,item_name,qty,unit_price,total_price")
      .eq("organization_id", organizationId).eq("entity_id", entityId).eq("purchase_order_id", po.id),
    supabaseAdmin.from("goods_receipt_items").select("id,goods_receipt_id,purchase_order_item_id,item_id,item_name,accepted_qty,received_qty,damaged_qty")
      .eq("organization_id", organizationId).eq("entity_id", entityId).eq("goods_receipt_id", receipt.id),
  ]);
  if (poItemsResult.error) throw poItemsResult.error;
  if (receiptItemsResult.error) throw receiptItemsResult.error;
  const resolvedLines = await resolveItemIds({ organizationId, entityId, lines });
  const poItems = poItemsResult.data || [];
  const receiptItems = receiptItemsResult.data || [];

  const linked = resolvedLines.map((line) => {
    const explicitPoItemId = text(line.purchase_order_item_id, 80) || null;
    let poMatches = explicitPoItemId ? poItems.filter((row) => row.id === explicitPoItemId) : [];
    if (!poMatches.length && line.item_id) poMatches = poItems.filter((row) => row.item_id === line.item_id);
    if (poMatches.length !== 1) return { ...line, purchase_order_item_id: null, goods_receipt_item_id: null, procurement_link_status: poMatches.length > 1 ? "PO_LINE_AMBIGUOUS" : "PO_LINE_UNRESOLVED" };
    const poItem = poMatches[0];
    const receiptMatches = receiptItems.filter((row) => row.purchase_order_item_id === poItem.id && (!line.item_id || !row.item_id || row.item_id === line.item_id));
    if (receiptMatches.length !== 1) return { ...line, purchase_order_item_id: poItem.id, goods_receipt_item_id: null, procurement_link_status: receiptMatches.length > 1 ? "RECEIPT_LINE_AMBIGUOUS" : "RECEIPT_LINE_UNRESOLVED" };
    return { ...line, item_id: line.item_id || poItem.item_id || null, purchase_order_item_id: poItem.id, goods_receipt_item_id: receiptMatches[0].id, procurement_link_status: "EXACT" };
  });
  const unresolved = linked.filter((line) => line.procurement_link_status !== "EXACT");
  if (unresolved.length) {
    return { status: "LINE_LINKAGE_INCOMPLETE", purchase_order_reference: poReference, purchase_order_id: po.id, goods_receipt_id: receipt.id, lines: linked, touchless_eligible: false, unresolved_lines: unresolved.map((line, index) => ({ index, description: line.description, item_id: line.item_id || null, source_item_code: line.source_item_code || null, status: line.procurement_link_status })), blocker: `${unresolved.length} invoice line${unresolved.length === 1 ? "" : "s"} cannot be linked uniquely to purchase-order and receipt evidence.` };
  }

  return { status: "EXACT_MATCH", purchase_order_reference: poReference, purchase_order_id: po.id, purchase_order_number: po.po_number, goods_receipt_id: receipt.id, goods_receipt_number: receipt.grn_number || null, lines: linked, touchless_eligible: true, blocker: null };
}

export default resolveVendorBillProcurementEvidence;
