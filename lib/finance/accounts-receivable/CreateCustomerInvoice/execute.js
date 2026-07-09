import {
  createCustomerInvoiceCommand,
} from "../runtime/AccountsReceivableApplicationService";

import {
  mapCustomerInvoiceFormPayload,
} from "../mappers/customerInvoiceMapper";

import {
  createCustomer,
} from "@/lib/finance/createCustomer";


export async function execute({
  context,
  payload = {},
}) {

  let customerId =
    payload.customer_id;


  let partyId =
    payload.party_id || null;


  /*
    Existing customer relationship
  */

  if (!customerId && partyId) {

    const {
      data: customer,
      error,
    } =
      await import("@/lib/shared/supabase/admin")
        .then(
          ({ supabaseAdmin }) =>
            supabaseAdmin
        )
        .then(db =>
          db
            .from("customer_loyalty_accounts")
            .select("id")
            .eq(
              "party_id",
              partyId
            )
            .eq(
              "organization_id",
              context.organizationId
            )
            .maybeSingle()
        );


    if (error) {
      throw error;
    }


    if (!customer) {

      throw new Error(
        "Customer relationship not found"
      );

    }


    customerId =
      customer.id;

  }


  /*
    Inline new customer
  */

  if (!customerId && payload.customer) {

    const customer =
      await createCustomer({

        organization_id:
          context.organizationId,

        entity_id:
          context.entityId,

        customer_name:
          payload.customer.customer_name,

        customer_email:
          payload.customer.customer_email || null,

        customer_phone:
          payload.customer.customer_phone || null,


        customer_type:
          payload.customer.customer_type || "PERSON",

        company_name:
          payload.customer.company_name || null,

        tax_number:
          payload.customer.tax_number || null,


        billing_address:
          payload.customer.billing_address || null,

        shipping_address:
          payload.customer.shipping_address || null,


        city:
          payload.customer.city || null,

        state:
          payload.customer.state || null,

        postal_code:
          payload.customer.postal_code || null,

        country:
          payload.customer.country || null,


        preferred_language:
          payload.customer.preferred_language || null,

        preferred_currency:
          payload.customer.preferred_currency || null,


        credit_limit:
          payload.customer.credit_limit || 0,

        payment_terms:
          payload.customer.payment_terms || null,


        birthday:
          payload.customer.birthday || null,

        notes:
          payload.customer.notes || null,

      });


    customerId =
      customer.customer.id;


    partyId =
      customer.party.id;

  }


  if (!customerId) {

    throw new Error(
      "customer required"
    );

  }


  const invoicePayload =
    mapCustomerInvoiceFormPayload({
      payload,
      customerId,
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
