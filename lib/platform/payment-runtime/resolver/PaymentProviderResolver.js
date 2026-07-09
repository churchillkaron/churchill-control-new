import {
  PaymentProviderRegistry,
} from "../providers/PaymentProviderRegistry";


export function resolvePaymentProvider({

  method,

  country = null,

}) {

  const providers =
    PaymentProviderRegistry
      .getProvidersForMethod({
        method,
        country,
      });


  if (!providers.length) {

    throw new Error(
      `No payment provider available for ${method}`
    );

  }


  return providers[0];

}


export const PaymentProviderResolver = {

  resolvePaymentProvider,

};
