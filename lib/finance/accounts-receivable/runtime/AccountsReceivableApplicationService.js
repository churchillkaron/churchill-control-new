import createCustomerInvoice
from "../documents/createCustomerInvoice";

import postCustomerPayment
from "../capabilities/postCustomerPayment";

import reverseCustomerPayment
from "../capabilities/reverseCustomerPayment";

import issueCustomerCreditNote
from "../capabilities/issueCustomerCreditNote";

import applyCustomerCredit
from "../capabilities/applyCustomerCredit";

import refundCustomerCredit
from "../capabilities/refundCustomerCredit";

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

export async function issueCustomerCreditNoteCommand(
  input
){
  return await issueCustomerCreditNote(
    input
  );
}

export async function applyCustomerCreditCommand(
  input
){
  return await applyCustomerCredit(
    input
  );
}

export async function refundCustomerCreditCommand(
  input
){
  return await refundCustomerCredit(
    input
  );
}
