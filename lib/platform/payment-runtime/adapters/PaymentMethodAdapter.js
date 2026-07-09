const METHOD_MAP = {

  TRANSFER:
    "bank_transfer",

  BANK_TRANSFER:
    "bank_transfer",

  CARD:
    "credit_card",

  CREDIT_CARD:
    "credit_card",

  QR:
    "qr_payment",

  QR_PAYMENT:
    "qr_payment",

  CASH:
    "cash",

};


export function normalizePaymentMethod(
  method
){

  if (!method) {
    return null;
  }


  const key =
    String(method)
      .toUpperCase()
      .trim();


  return (
    METHOD_MAP[key]
    ||
    key.toLowerCase()
  );

}


export const PaymentMethodAdapter = {

  normalizePaymentMethod,

};
