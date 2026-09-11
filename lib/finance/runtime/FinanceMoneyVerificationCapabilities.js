import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const text = (value, limit = 160) => String(value ?? "").trim().slice(0, limit);

function exactMoneyRead({ capability, permission, table, idKey }) {
  const manifest = defineCapability({
    domain: "finance", capability, action: "read",
    description: `Verify one exact ${capability.replaceAll("_", " ")} record after a governed Finance write.`,
    permissions: [permission], events: [], tags: ["finance", "verification", capability],
    transactional: false, aiEnabled: false, operatorEnabled: true, operatorMode: "read",
    operatorAutoExecute: true, operatorRequiresConfirmation: false, risk: "low", contextScope: "entity",
    inputSchema: { type: "object", required: [idKey], properties: { [idKey]: { type: "string" } }, additionalProperties: false },
  });
  const authorize = ({ context }) => requireExecutionPermission(context, permission);
  const execute = async ({ context, payload = {} }) => {
    const id = text(payload[idKey]);
    if (!id) throw new Error(`${idKey} required`);
    const result = await supabaseAdmin.from(table).select("*")
      .eq("organization_id", context.organizationId).eq("entity_id", context.entityId).eq("id", id).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw new Error(`${capability.toUpperCase()}_NOT_FOUND`);
    return { success: true, [idKey]: result.data.id, record: result.data };
  };
  return { manifest, authorize, execute };
}

export const createCustomerReceiptReadCapability = () => exactMoneyRead({
  capability: "customer_receipt", permission: "finance.receivables.manage", table: "customer_payments", idKey: "payment_id",
});
export const createExpenseReceiptReadCapability = () => exactMoneyRead({
  capability: "expense_receipts", permission: "finance.accounting.manage", table: "finance_expense_receipts", idKey: "receipt_id",
});
