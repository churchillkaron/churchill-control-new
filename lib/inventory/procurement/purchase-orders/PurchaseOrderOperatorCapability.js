import { createHash } from "node:crypto";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const REQUIRED_PERMISSION = "procurement.manage";
const text = (value) => String(value ?? "").trim();
const actorId = (context = {}) => text(context.actor?.id || context.actor?.user_id || context.metadata?.actorId);

export function createPurchaseOrderCapability() {
  const manifest = defineCapability({
    domain: "supply-chain", capability: "purchase_orders", action: "create",
    name: "Create purchase order", description: "Atomically create a supplier purchase order and its reviewed line items.",
    permissions: [REQUIRED_PERMISSION], events: ["supply_chain.purchase_order.created"],
    tags: ["supply-chain","procurement","purchase-order","supplier"], transactional: true,
    aiEnabled: false, operatorEnabled: true, operatorMode: "approve", operatorAutoExecute: false,
    operatorRequiresConfirmation: true, risk: "high", reversible: true, contextScope: "entity",
    operatorVerification: { capability_key: "supply_chain.purchase_orders.read", payload_from_result: { id: ["purchase_order.id", "id"] }, derivation: "declared_result_bound_record_verifier" },
    inputSchema: { type: "object", required: ["supplier_party_id","items"], properties: {
      supplier_party_id: { type: "string" }, items: { type: "array", minItems: 1, maxItems: 500 },
      currency: { type: "string" }, expected_delivery_date: { type: "string" }, notes: { type: "string" },
      source_reference: { type: "string" }, source_attachment_sha256: { type: "string" },
    }, additionalProperties: false },
  });
  async function execute({ context, payload = {} }) {
    await requireExecutionPermission(context, REQUIRED_PERMISSION);
    const organizationId = text(context.organizationId); const entityId = text(context.entityId); const actor = actorId(context);
    if (!organizationId || !entityId || !actor) throw new Error("Authenticated organization/entity actor required");
    if (!text(payload.supplier_party_id)) throw new Error("supplier_party_id required");
    if (!Array.isArray(payload.items) || !payload.items.length) throw new Error("items required");
    const identity = [organizationId,entityId,payload.supplier_party_id,payload.source_attachment_sha256 || JSON.stringify(payload.items)].join("|");
    const idempotencyKey = `operator-purchase-order-v1:${createHash("sha256").update(identity).digest("hex")}`;
    const result = await supabaseAdmin.rpc("create_purchase_order_atomic_rpc", {
      p_organization_id: organizationId, p_entity_id: entityId, p_supplier_party_id: payload.supplier_party_id,
      p_items: payload.items, p_ordered_by: actor, p_currency: text(payload.currency) || "THB",
      p_expected_delivery_date: text(payload.expected_delivery_date) || null, p_notes: text(payload.notes) || null,
      p_source_reference: text(payload.source_reference) || null, p_source_attachment_sha256: text(payload.source_attachment_sha256) || null,
      p_actor_id: actor, p_idempotency_key: idempotencyKey,
    });
    if (result.error) throw result.error;
    return { success: true, ...result.data, authorization_effect: "CONFIRMED_OPERATOR_WRITE" };
  }
  return { manifest, execute };
}
export default createPurchaseOrderCapability;
