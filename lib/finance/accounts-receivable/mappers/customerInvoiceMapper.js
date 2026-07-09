export function mapCustomerInvoiceFormPayload({

  payload = {},

  customerId = null,

}) {

  return {

    ...payload,

    customer_id:
      customerId ||
      payload.customer_id ||
      payload.party_id ||
      null,

    invoice_date:
      payload.invoice_date ||
      null,

    due_date:
      payload.due_date ||
      null,

    lines:
      payload.lines ||
      [],

  };

}
