import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { upsertCustomerParty } from "@/lib/commercial/customers/CustomerService";

function text(value, limit = 4000) { return String(value ?? "").trim().slice(0, limit); }

export function createCommercialCustomerCreateCapability() {
  const manifest = defineCapability({
    domain: "commercial", capability: "customers", action: "create",
    description: "Create a canonical Commercial customer party and customer relationship. Existing customer records are never updated by this action.",
    permissions: [], events: ["commercial.customer.created"], tags: ["commercial", "customer", "party", "master-data"],
    transactional: true, aiEnabled: false, operatorEnabled: true, operatorMode: "write", operatorAutoExecute: false,
    operatorRequiresConfirmation: true, risk: "medium", contextScope: "organization",
    operatorVerification: { capability_key: "commercial.customers.read", payload_from_result: { party_id: ["party_id", "customer.party_id", "customer.id"] }, derivation: "declared_result_bound_customer_verifier" },
    inputSchema: { type: "object", required: ["customer_name"], additionalProperties: false, properties: {
      customer_name:{type:"string"}, customer_type:{type:"string"}, customer_email:{type:"string"}, customer_phone:{type:"string"},
      legal_name:{type:"string"}, tax_id:{type:"string"}, address:{type:"string"}, customer_number:{type:"string"}, preferred_currency:{type:"string"},
      payment_terms:{type:"string"}, country:{type:"string"}, city:{type:"string"}, postal_code:{type:"string"}, notes:{type:"string"}
    }}
  });

  async function execute({ context, payload = {} }) {
    if (!context?.callerRequest) throw new Error("COMMERCIAL_CUSTOMER_CALLER_REQUEST_REQUIRED");
    const access = await requireOrganizationAccess({ organizationId: context.organizationId, request: context.callerRequest });
    if (!access.success) { const error = new Error(access.error || "COMMERCIAL_CUSTOMER_ORGANIZATION_ACCESS_REQUIRED"); error.status = access.status || 403; throw error; }
    if (text(access.user?.id,160) !== text(context.actor?.id,160)) { const error = new Error("COMMERCIAL_CUSTOMER_EXECUTION_ACTOR_MISMATCH"); error.status=403; throw error; }
    const body = {
      customer_name: text(payload.customer_name,500), customer_type: text(payload.customer_type || "COMPANY",40),
      customer_email: text(payload.customer_email,320) || null, customer_phone: text(payload.customer_phone,120) || null,
      legal_name: text(payload.legal_name,500) || null, tax_id: text(payload.tax_id,160) || null, address: text(payload.address,1000) || null,
      customer_number: text(payload.customer_number,160) || null, preferred_currency: text(payload.preferred_currency,12) || null,
      payment_terms: text(payload.payment_terms,120) || null, country: text(payload.country,120) || null, city: text(payload.city,160) || null,
      postal_code: text(payload.postal_code,40) || null, notes: text(payload.notes,2000) || null,
    };
    if (!body.customer_name) throw new Error("Customer name required");
    return upsertCustomerParty({ access, body, organizationId: context.organizationId });
  }
  return { manifest, execute };
}
export default createCommercialCustomerCreateCapability;
