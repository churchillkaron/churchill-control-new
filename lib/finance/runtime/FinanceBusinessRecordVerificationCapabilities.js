import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const text = (value) => String(value ?? "").trim();

function exactFinanceRecordRead({ capability, table, permission }) {
  const manifest = defineCapability({
    domain: "finance", capability, action: "read",
    description: `Read one exact ${capability.replaceAll("_", " ")} record for authoritative post-action verification.`,
    permissions: [permission], events: [], tags: ["finance", capability, "verification", "read"],
    transactional: false, aiEnabled: false, operatorEnabled: true, operatorMode: "read",
    operatorAutoExecute: true, operatorRequiresConfirmation: false, risk: "low", contextScope: "entity",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } }, additionalProperties: false },
  });

  async function execute({ context, payload = {} }) {
    await requireExecutionPermission(context, permission);
    const organizationId = text(context.organizationId);
    const entityId = text(context.entityId);
    const id = text(payload.id);
    if (!organizationId || !entityId || !id) throw new Error("organization_id, entity_id and exact record id required");
    const { data, error } = await supabaseAdmin.from(table).select("*")
      .eq("organization_id", organizationId).eq("entity_id", entityId).eq("id", id).maybeSingle();
    if (error) throw error;
    const found = Boolean(data);
    return {
      success: true, id: found ? id : null, record: data || null,
      authoritative_server_evidence: true,
      business_effect_outcome: {
        contract: "AVANTIQO_AUTHORITATIVE_BUSINESS_EFFECT_OUTCOME_V1",
        state: found ? "COMPLETED" : "NOT_COMPLETED",
        authoritative_server_evidence: true,
        exact_business_scope_matched: true,
        business_effect_observed: found,
        business_effect_absent: !found,
        safe_to_retry: !found,
      },
    };
  }

  return { manifest, execute };
}

export const createCustomerInvoiceReadCapability = () => exactFinanceRecordRead({
  capability: "customer_invoices", table: "customer_invoices", permission: "finance.receivables.manage",
});

export const createVendorBillReadCapability = () => exactFinanceRecordRead({
  capability: "vendor_bills", table: "vendor_invoices", permission: "finance.payables.manage",
});
