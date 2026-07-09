const PROVIDERS = {

  credit_card: [
    {
      id:"stripe",
      name:"Stripe",
      method:"credit_card",
      countries:["*"],
    },
  ],


  bank_transfer: [
    {
      id:"bank_transfer",
      name:"Bank Transfer",
      method:"bank_transfer",
      countries:["*"],
    },
  ],


  qr_payment: [
    {
      id:"promptpay",
      name:"PromptPay",
      method:"qr_payment",
      countries:["TH"],
    },
  ],


  paypal: [
    {
      id:"paypal",
      name:"PayPal",
      method:"paypal",
      countries:["US","GB","EU"],
    },
  ],

};


export function getProvidersForMethod({
  method,
  country = null,
}) {

  return (
    PROVIDERS[method] || []
  )
  .filter(provider => {

    if (
      provider.countries.includes("*")
    ) {
      return true;
    }


    return (
      country &&
      provider.countries.includes(country)
    );

  });

}


export const PaymentProviderRegistry = {

  getProvidersForMethod,

};
