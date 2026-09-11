import { createHash } from "node:crypto";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { createVendor } from "@/lib/inventory/procurement/suppliers/documents/createVendor";

const REQUIRED_PERMISSION = "procurement.manage";
const text = (value) => String(value ?? "").trim();
const actorId = (context = {}) => text(context.actor?.id || context.actor?.user_id || context.metadata?.actorId);

export function createSupplierCapability() {
  const manifest = defineCapability({
    domain: "supply-chain", capability: "suppliers", action: "create",
    name: "Create supplier", description: "Atomically create or link a supplier master using strong reviewed identity evidence.",
    permissions: [REQUIRED_PERMISSION], events: ["supply_chain.supplier.created"],
    tags: ["supply-chain","procurement","supplier","vendor"], transactional: true,
    aiEnabled: false, operatorEnabled: true, operatorMode: "approve", operatorAutoExecute: false,
    operatorRequiresConfirmation: true, risk: "high", reversible: true, contextScope: "organization",
    operatorVerification: { capability_key: "supply_chain.suppliers.read", payload_from_result: { party_id: ["party_id", "id"] }, derivation: "declared_result_bound_record_verifier" },
    inputSchema: { type: "object", required: ["legal_name"], properties: {
      legal_name: { type: "string" }, display_name: { type: "string" }, vendor_code: { type: "string" },
      tax_id: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, address: { type: "string" },
      payment_terms: { type: "string" }, default_expense_account: { type: "string" }, default_ap_account: { type: "string" },
      risk_level: { type: "string" }, notes: { type: "string" }, source_attachment_sha256: { type: "string" },
    }, additionalProperties: false },
  });
  async function execute({ context, payload = {} }) {
    await requireExecutionPermission(context, REQUIRED_PERMISSION);
    const organizationId = text(context.organizationId);
    const actor = actorId(context);
    if (!organizationId || !actor) throw new Error("Authenticated organization actor required");
    const legalName = text(payload.legal_name);
    if (!legalName) throw new Error("legal_name required");
    if (!text(payload.vendor_code) && !text(payload.tax_id) && !text(payload.email)) {
      throw new Error("Strong supplier identifier required: vendor code, tax id, or email");
    }
    const identity = [organizationId,text(payload.vendor_code),text(payload.tax_id),text(payload.email).toLowerCase(),text(payload.source_attachment_sha256)].join("|");
    const idempotencyKey = `operator-supplier-create-v1:${createHash("sha256").update(identity).digest("hex")}`;
    return createVendor({
      organization_id: organizationId,
      ...payload,
      email: text(payload.email).toLowerCase() || null,
      actor_id: actor,
      idempotency_key: idempotencyKey,
    });
  }

  return { manifest, execute };
}

export default createSupplierCapability;
