import createCustomerInvoice
from "../documents/createCustomerInvoice";

import postCustomerPayment
from "../capabilities/postCustomerPayment";

export async function createCustomerInvoiceCommand(
  input
){
  return await createCustomerInvoice(
    input
  );
}

export async function postCustomerPaymentCommand(
  input
){
  return await postCustomerPayment(
    input
  );
}
