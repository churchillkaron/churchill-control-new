import createCustomerInvoice
from "../documents/createCustomerInvoice";

import postCustomerPayment
from "../capabilities/postCustomerPayment";

import reverseCustomerPayment
from "../capabilities/reverseCustomerPayment";

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

export async function reverseCustomerPaymentCommand(
  input
){
  return await reverseCustomerPayment(
    input
  );
}
