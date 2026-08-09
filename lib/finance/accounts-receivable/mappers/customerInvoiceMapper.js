export function mapCustomerInvoiceFormPayload({

  payload = {},

  partyId = null,

}) {

  return {

    ...payload,

    party_id:
      partyId ||
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
