export function createPaymentTransaction({

  organization_id,

  entity_id = null,

  party_id = null,

  method,

  provider,

  amount,

  currency,

  status = "pending",

  metadata = {},

}) {

  return {

    organization_id,

    entity_id,

    party_id,

    payment_method:
      method,

    provider:
      provider?.id || null,

    provider_reference:
      null,

    amount,

    currency,

    status,

    metadata,

  };

}
