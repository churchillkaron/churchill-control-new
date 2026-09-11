import { createHash } from "node:crypto";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { createVendorInvoice } from "@/lib/finance/accounts-payable/documents/createVendorInvoice";

const REQUIRED_PERMISSION = "finance.payables.manage";
const text = (value) => String(value ?? "").trim();
const actorId = (context = {}) => text(context.actor?.id || context.actor?.user_id || context.metadata?.actorId);

export const manifest = defineCapability({
  domain: "finance", capability: "vendor_bills", action: "create",
  name: "Create vendor bill", description: "Create an unpaid supplier invoice in canonical Accounts Payable.",
  permissions: [REQUIRED_PERMISSION], events: ["finance.vendor_bill.created"],
  tags: ["finance", "accounts_payable", "supplier", "vendor", "invoice"], transactional: true,
  aiEnabled: false, operatorEnabled: true, operatorMode: "approve", operatorAutoExecute: false,
  operatorRequiresConfirmation: true, risk: "high", reversible: true, contextScope: "entity",
  operatorVerification: { capability_key: "finance.vendor_bills.read", payload_from_result: { id: ["invoice.id", "vendor_invoice.id", "id"] }, derivation: "declared_result_bound_record_verifier" },
  inputSchema: { type: "object", properties: {
    vendor_party_id: { type: "string" }, invoice_number: { type: "string" }, invoice_date: { type: "string" },
    due_date: { type: "string" }, currency_code: { type: "string" }, exchange_rate: { type: "number" },
    purchase_order_id: { type: "string" }, goods_receipt_id: { type: "string" }, document_id: { type: "string" },
    source_attachment_sha256: { type: "string" }, ocr_confidence: { type: "number" }, lines: { type: "array" },
  }, required: ["vendor_party_id", "invoice_number", "invoice_date", "currency_code", "lines"], additionalProperties: false },
});

export function validate({ context, payload = {} }) {
  if (!text(context?.organizationId)) throw new Error("organization_id required");
  if (!text(context?.entityId)) throw new Error("entity_id required");
  if (!actorId(context)) throw new Error("authenticated actor required");
  for (const field of ["vendor_party_id", "invoice_number", "invoice_date", "currency_code"]) {
    if (!text(payload[field])) throw new Error(`${field} required`);
  }
  if (!Array.isArray(payload.lines) || payload.lines.length === 0) throw new Error("invoice lines required");
  return true;
}

export function authorize({ context }) { return requireExecutionPermission(context, REQUIRED_PERMISSION); }

export async function execute({ context, payload = {} }) {
  const organizationId = text(context.organizationId); const entityId = text(context.entityId); const createdBy = actorId(context);
  const identity = [organizationId, entityId, payload.vendor_party_id, payload.invoice_number, payload.invoice_date, payload.source_attachment_sha256 || "no-file"].join("|");
  const idempotencyKey = `operator-vendor-bill-v1:${createHash("sha256").update(identity).digest("hex")}`;
  return createVendorInvoice({ organizationId, entityId, vendorPartyId: payload.vendor_party_id,
    purchaseOrderId: payload.purchase_order_id || null, goodsReceiptId: payload.goods_receipt_id || null,
    documentId: payload.document_id || null, invoiceNumber: payload.invoice_number, invoiceDate: payload.invoice_date,
    dueDate: payload.due_date || null, currencyCode: payload.currency_code, exchangeRate: payload.exchange_rate ?? 1,
    lines: payload.lines, source: "business_partner_attachment", aiExtracted: true,
    ocrConfidence: Number(payload.ocr_confidence || 0), createdBy, idempotencyKey });
}
export default { manifest, validate, authorize, execute };
