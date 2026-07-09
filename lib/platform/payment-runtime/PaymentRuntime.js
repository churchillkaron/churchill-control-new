import {
  PaymentConfigurationRuntime,
} from "./configuration/PaymentConfigurationRuntime";

import {
  PAYMENT_METHOD_CATALOG,
  getPaymentMethodDetails,
} from "./catalog/PaymentMethodCatalog";

import {
  PaymentProviderResolver,
} from "./resolver/PaymentProviderResolver";

import {
  normalizePaymentMethod,
} from "./adapters/PaymentMethodAdapter";


export async function getAvailablePaymentMethods({
  organizationId = null,
  country = null,
  currency = null,
}) {

  let configured =
    await PaymentConfigurationRuntime
      .getConfiguredPaymentMethods({
        organizationId,
        country,
        currency,
      });

  if (
    currency &&
    !configured.length
  ) {
    configured =
      await PaymentConfigurationRuntime
        .getConfiguredPaymentMethods({
          organizationId,
          country,
          currency: null,
        });
  }


  if (!configured.length) {
    return PAYMENT_METHOD_CATALOG;
  }


  const methods =
    configured
      .map(config =>
        getPaymentMethodDetails(
          config.payment_method
        )
      )
      .filter(Boolean);


  return methods;

}


export function resolvePaymentProvider({
  method,
  country = null,
}) {

  const normalized =
    normalizePaymentMethod(
      method
    );


  return PaymentProviderResolver
    .resolvePaymentProvider({
      method: normalized,
      country,
    });

}


export function getPaymentMethod(id){

  const normalized =
    normalizePaymentMethod(
      id
    );


  return (
    getPaymentMethodDetails(normalized) ||
    null
  );

}


export const PaymentRuntime = {

  getAvailablePaymentMethods,

  getPaymentMethod,

  resolvePaymentProvider,

};
