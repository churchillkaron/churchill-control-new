export const PAYMENT_METHOD_CATALOG = [

  {
    id:"credit_card",
    name:"Credit Card",
    type:"card",
  },

  {
    id:"bank_transfer",
    name:"Bank Transfer",
    type:"bank",
  },

  {
    id:"qr_payment",
    name:"QR Payment",
    type:"qr",
  },

  {
    id:"paypal",
    name:"PayPal",
    type:"wallet",
  },

];


export function getPaymentMethodDetails(id){

  return (
    PAYMENT_METHOD_CATALOG.find(
      method =>
        method.id === id
    )
    ||
    null
  );

}
