import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";

import {
  createCustomerInvoiceCommand,
} from "../runtime/AccountsReceivableApplicationService";

import {
  mapCustomerInvoiceFormPayload,
} from "../mappers/customerInvoiceMapper";

import {
  upsertCustomerParty,
} from "@/lib/commercial/customers/CustomerService";


export const manifest = defineCapability({
  domain: "finance",
  capability: "accounts_receivable",
  action: "CreateCustomerInvoice",
  name: "Create customer invoice",
  document: "CustomerInvoice",
  description:
    "Create a customer invoice through the canonical Finance accounts receivable application service, including an inline new customer when supplied.",
  permissions: ["finance.receivables.manage"],
  events: ["finance.customer_invoice.created"],
  tags: ["finance", "accounts-receivable", "customer", "invoice", "billing", "write"],
  operatorAliases: [
    "create invoice",
    "create an invoice",
    "create customer invoice",
    "create a customer invoice",
    "make invoice",
    "make an invoice",
    "issue invoice",
    "bill customer",
  ],
  operatorExamples: [
    "Create an invoice for this customer.",
    "Make a customer invoice for Moonshine.",
    "Issue the approved invoice now.",
  ],
  transactional: true,
  aiEnabled: true,
  operatorEnabled: true,
  operatorMode: "write",
  operatorAutoExecute: false,
  operatorRequiresConfirmation: true,
  contextScope: "entity",
  risk: "medium",
  reversible: false,
  inputSchema: {
    type: "object",
    properties: {
      party_id: { type: "string", description: "Existing customer party id." },
      customer: { type: "object", description: "Inline new customer details when party_id is not known." },
      invoice_date: { type: "string" },
      due_date: { type: "string" },
      currency_code: { type: "string" },
      exchange_rate: { type: "number" },
      lines: { type: "array", items: { type: "object" } },
      notes: { type: "string" },
    },
    additionalProperties: true,
  },
  outputSchema: { type: "object", additionalProperties: true },
});

export function authorize({ context }) {
  return requireExecutionPermission(context, "finance.receivables.manage");
}

export async function execute({
  context,
  payload = {},
}) {

  let partyId =
    payload.party_id || null;


  /*
    Inline new customer
  */

  if (!partyId && payload.customer) {

    const customer = await upsertCustomerParty({
      access: context.access || context,
      body: payload.customer,
      organizationId: context.organizationId,
    });

    partyId = customer.party_id;

  }


  if (!partyId) {

    throw new Error(
      "customer party required"
    );

  }


  const invoicePayload =
    mapCustomerInvoiceFormPayload({
      payload,
      partyId,
    });


  return await createCustomerInvoiceCommand({

    ...invoicePayload,

    organization_id:
      context.organizationId,

    entity_id:
      context.entityId,

    period_id:
      context.periodId,

    party_id:
      partyId,

  });

}
