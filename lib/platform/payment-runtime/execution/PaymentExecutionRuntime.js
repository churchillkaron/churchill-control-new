import {
  PaymentProviderResolver,
} from "../resolver/PaymentProviderResolver";


import {
  createPaymentTransaction,
} from "../documents/PaymentTransaction";

import {
  PaymentTransactionRepository,
} from "../repositories/PaymentTransactionRepository";


export async function createPayment({

  organizationId,

  entityId = null,

  partyId = null,

  method,

  country,

  amount,

  currency,

  metadata = {},

}) {


  const provider =
    PaymentProviderResolver
      .resolvePaymentProvider({

        method,

        country,

      });


  const transaction =
    createPaymentTransaction({

      organization_id:
        organizationId,

      entity_id:
        entityId,

      party_id:
        partyId,

      method,

      provider,

      amount,

      currency,

      metadata,

    });


  return PaymentTransactionRepository.create(
    transaction
  );


}


export const PaymentExecutionRuntime = {

  createPayment,

};
