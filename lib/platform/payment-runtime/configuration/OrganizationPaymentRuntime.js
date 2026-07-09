import {
  PaymentConfigurationRepository,
} from "../repositories/PaymentConfigurationRepository";


export async function getOrganizationPaymentMethods({
  organizationId,
  methods = [],
}) {

  if (!organizationId) {
    return methods;
  }


  try {

    const settings =
      await PaymentConfigurationRepository.list({
        organizationId,
      });


    if (!settings.length) {
      return methods;
    }


    return methods.filter(method =>
      settings.some(
        setting =>
          setting.payment_method === method.id &&
          setting.enabled === true
      )
    );


  } catch (error) {

    console.warn(
      "Payment configuration unavailable, using defaults",
      error.message
    );

    return methods;

  }

}


export const OrganizationPaymentRuntime = {

  getOrganizationPaymentMethods,

};
