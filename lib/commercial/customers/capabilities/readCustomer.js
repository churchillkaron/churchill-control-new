import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getCustomer } from "@/lib/commercial/customers/CustomerService";

const text = (value, limit = 4000) => String(value ?? "").trim().slice(0, limit);

export const manifest = defineCapability({
  domain: "commercial", capability: "customers", action: "read",
  description: "Read one exact organization-scoped Commercial customer by canonical party id.",
  permissions: [], events: [], tags: ["commercial", "customer", "read", "verification"],
  transactional: false, aiEnabled: false, operatorEnabled: true, operatorMode: "read", operatorAutoExecute: true,
  operatorRequiresConfirmation: false, risk: "low", contextScope: "organization",
  inputSchema: { type: "object", required: ["party_id"], properties: { party_id: { type: "string" } }, additionalProperties: false },
});

export async function execute({ context, payload = {} }) {
  if (!context?.callerRequest) throw new Error("COMMERCIAL_CUSTOMER_READ_CALLER_REQUEST_REQUIRED");
  const access = await requireOrganizationAccess({ organizationId: context.organizationId, request: context.callerRequest });
  if (!access.success) { const error = new Error(access.error || "COMMERCIAL_CUSTOMER_READ_ACCESS_REQUIRED"); error.status = access.status || 403; throw error; }
  const partyId = text(payload.party_id, 160);
  if (!partyId) throw new Error("party_id required");
  const customer = await getCustomer({ organizationId: access.organizationId, partyId });
  return { success: true, party_id: partyId, customer, found: Boolean(customer) };
}
