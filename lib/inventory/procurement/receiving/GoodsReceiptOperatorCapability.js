import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import receivePurchaseOrder from "@/lib/inventory/procurement/receiving/receivePurchaseOrder";

function text(value, max = 4000) { return String(value ?? "").trim().slice(0, max); }

export function createGoodsReceiptCapability() {
  const manifest = defineCapability({
    domain: "supply-chain", capability: "goods_receipts", action: "receive",
    description: "Receive one approved purchase order through the canonical atomic procurement receiving runtime.",
    permissions: [], events: ["supply_chain.goods_receipt.received"],
    tags: ["supply-chain", "procurement", "receiving", "goods-receipt"], transactional: true,
    aiEnabled: false, operatorEnabled: true, operatorMode: "write", operatorAutoExecute: false,
    operatorRequiresConfirmation: true, risk: "high", contextScope: "entity",
    inputSchema: { type: "object", required: ["purchase_order_id"], properties: { purchase_order_id: { type: "string" } }, additionalProperties: false },
  });
  async function execute({ context, payload = {} }) {
    if (!context?.callerRequest) throw new Error("GOODS_RECEIPT_CALLER_REQUEST_REQUIRED");
    if (!text(context.entityId, 160)) throw new Error("GOODS_RECEIPT_ENTITY_REQUIRED");
    const access = await requireOrganizationAccess({ organizationId: context.organizationId, request: context.callerRequest });
    if (!access.success) { const error = new Error(access.error || "GOODS_RECEIPT_ACCESS_REQUIRED"); error.status = access.status || 403; throw error; }
    if (text(access.user?.id, 160) !== text(context.actor?.id, 160)) { const error = new Error("GOODS_RECEIPT_ACTOR_MISMATCH"); error.status = 403; throw error; }
    const actorId = text(access.access?.staffAccountId, 160);
    if (!actorId) throw new Error("GOODS_RECEIPT_STAFF_ACCOUNT_REQUIRED");
    const result = await receivePurchaseOrder({ organization_id: context.organizationId, entity_id: context.entityId, purchase_order_id: text(payload.purchase_order_id, 160), received_by: access.staff?.display_name || access.staff?.name || access.user?.email || "WAREHOUSE", actor_id: actorId });
    if (!result?.success) throw new Error(result?.error || "GOODS_RECEIPT_FAILED");
    return { ...result, authorization_effect: "CONFIRMED_OPERATOR_WRITE" };
  }
  return { manifest, execute };
}
export default createGoodsReceiptCapability;
