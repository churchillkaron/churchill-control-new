import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const text = (value) => String(value ?? "").trim();

function exactRead({ capability, table, permission, contextScope = "entity", idField = "id" }) {
  const manifest = defineCapability({
    domain: "supply-chain", capability, action: "read",
    description: `Read one exact ${capability.replaceAll("_", " ")} record for authoritative post-action verification.`,
    permissions: [permission], events: [], tags: ["supply-chain", capability, "read", "verification"],
    transactional: false, aiEnabled: false, operatorEnabled: true, operatorMode: "read",
    operatorAutoExecute: true, operatorRequiresConfirmation: false, risk: "low", contextScope,
    inputSchema: { type: "object", required: [idField], properties: { [idField]: { type: "string" } }, additionalProperties: false },
  });
  async function execute({ context, payload = {} }) {
    await requireExecutionPermission(context, permission);
    const organizationId = text(context.organizationId);
    const recordId = text(payload[idField]);
    if (!organizationId || !recordId) throw new Error("organization_id and exact record id required");
    let query = supabaseAdmin.from(table).select("*").eq("organization_id", organizationId).eq(idField === "party_id" ? "party_id" : "id", recordId);
    if (contextScope === "entity") {
      const entityId = text(context.entityId);
      if (!entityId) throw new Error("entity_id required");
      query = query.eq("entity_id", entityId);
    }
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return { success: true, record: data || null, [idField]: data ? recordId : null, authoritative_server_evidence: true };
  }
  return { manifest, execute };
}

export const createPurchaseOrderReadCapability = () => exactRead({ capability: "purchase_orders", table: "purchase_orders", permission: "procurement.manage" });
export const createGoodsReceiptReadCapability = () => exactRead({ capability: "goods_receipts", table: "goods_receipts", permission: "procurement.manage" });
export const createSupplierReadCapability = () => exactRead({ capability: "suppliers", table: "supplier_profiles", permission: "procurement.manage", contextScope: "organization", idField: "party_id" });
export const createProductionBatchReadCapability = () => exactRead({ capability: "production_batches", table: "production_batches", permission: "production.manage" });
