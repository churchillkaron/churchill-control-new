import {
  PaymentConfigurationRepository,
} from "../repositories/PaymentConfigurationRepository";


export async function getConfiguredPaymentMethods({

  organizationId,

  country = null,

  currency = null,

}) {


  if (!organizationId) {
    return [];
  }


  const configurations =
    await PaymentConfigurationRepository.list({
      organizationId,
    });


  return configurations.filter(config => {

    if (
      country &&
      config.country &&
      config.country !== country
    ) {
      return false;
    }


    if (
      currency &&
      config.currency &&
      config.currency !== currency
    ) {
      return false;
    }


    return true;

  });


}


export const PaymentConfigurationRuntime = {

  getConfiguredPaymentMethods,

};
