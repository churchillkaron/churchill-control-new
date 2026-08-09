import {
  createCustomerInvoiceCommand,
} from "../runtime/AccountsReceivableApplicationService";

import {
  mapCustomerInvoiceFormPayload,
} from "../mappers/customerInvoiceMapper";

import {
  upsertCustomerParty,
} from "@/lib/commercial/customers/CustomerService";


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
