import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const text = (value) => String(value ?? "").trim();

function exactRead({ capability, table, permission, contextScope = "entity", idField = "id", recoveryLocatorField = null, recoveryStorageField = null }) {
  const manifest = defineCapability({
    domain: "supply-chain", capability, action: "read",
    description: `Read one exact ${capability.replaceAll("_", " ")} record for authoritative post-action verification.`,
    permissions: [permission], events: [], tags: ["supply-chain", capability, "read", "verification"],
    transactional: false, aiEnabled: false, operatorEnabled: true, operatorMode: "read",
    operatorAutoExecute: true, operatorRequiresConfirmation: false, risk: "low", contextScope,
    inputSchema: {
      type: "object",
      required: recoveryLocatorField ? [] : [idField],
      properties: { [idField]: { type: "string" }, ...(recoveryLocatorField ? { [recoveryLocatorField]: { type: "string" } } : {}) },
      additionalProperties: false,
    },
  });
  async function execute({ context, payload = {} }) {
    await requireExecutionPermission(context, permission);
    const organizationId = text(context.organizationId);
    const recordId = text(payload[idField]);
    const recoveryLocator = recoveryLocatorField ? text(payload[recoveryLocatorField]) : "";
    if (!organizationId || (!recordId && !recoveryLocator) || (recordId && recoveryLocator)) {
      throw new Error("organization_id and exactly one authoritative record locator required");
    }
    const queryField = recordId
      ? (idField === "party_id" ? "party_id" : "id")
      : recoveryStorageField;
    const queryValue = recordId || recoveryLocator;
    if (!queryField) throw new Error("authoritative recovery locator storage field required");
    let query = supabaseAdmin.from(table).select("*").eq("organization_id", organizationId).eq(queryField, queryValue);
    if (contextScope === "entity") {
      const entityId = text(context.entityId);
      if (!entityId) throw new Error("entity_id required");
      query = query.eq("entity_id", entityId);
    }
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    const resolvedId = data ? text(idField === "party_id" ? data.party_id : data.id) : null;
    return {
      success: true,
      record: data || null,
      [idField]: resolvedId,
      ...(recoveryLocatorField ? { [recoveryLocatorField]: data ? recoveryLocator || text(data[recoveryStorageField]) : recoveryLocator || null } : {}),
      authoritative_server_evidence: true,
      exact_business_scope_matched: true,
      business_effect_observed: Boolean(data),
      business_effect_absent: !data,
      safe_to_retry: !data,
      business_effect_outcome: {
        state: data ? "COMPLETED" : "NOT_COMPLETED",
        authoritative_server_evidence: true,
        exact_business_scope_matched: true,
        business_effect_observed: Boolean(data),
        business_effect_absent: !data,
        safe_to_retry: !data,
        derivation: recoveryLocator ? "SERVER_BOUND_IDEMPOTENCY_LOCATOR_REINSPECTION" : "SERVER_BOUND_EXACT_BUSINESS_ID_REINSPECTION",
      },
    };
  }
  return { manifest, execute };
}

export const createPurchaseOrderReadCapability = () => exactRead({ capability: "purchase_orders", table: "purchase_orders", permission: "procurement.manage", recoveryLocatorField: "idempotency_key", recoveryStorageField: "idempotency_key" });
export const createGoodsReceiptReadCapability = () => exactRead({ capability: "goods_receipts", table: "goods_receipts", permission: "procurement.manage" });
export const createSupplierReadCapability = () => exactRead({ capability: "suppliers", table: "supplier_profiles", permission: "procurement.manage", contextScope: "organization", idField: "party_id", recoveryLocatorField: "idempotency_key", recoveryStorageField: "source_idempotency_key" });
export const createProductionBatchReadCapability = () => exactRead({ capability: "production_batches", table: "production_batches", permission: "production.manage" });
