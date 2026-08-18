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

import postCustomerPrepayment
from "../capabilities/postCustomerPrepayment";

import applyCustomerPrepayment
from "../capabilities/applyCustomerPrepayment";

import refundCustomerPrepayment
from "../capabilities/refundCustomerPrepayment";

import { projectCustomerPaymentMarketingOutcome }
from "../../marketing/projectCustomerPaymentMarketingOutcome";

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
  const result = await postCustomerPayment(
    input
  );

  const marketing_outcome = await projectCustomerPaymentMarketingOutcome({
    input,
    result,
  });

  return {
    ...result,
    marketing_outcome,
  };
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

export async function postCustomerPrepaymentCommand(
  input
){
  return await postCustomerPrepayment({
    ...input,
    system_automation: false,
  });
}

export async function applyCustomerPrepaymentCommand(
  input
){
  return await applyCustomerPrepayment({
    ...input,
    system_automation: false,
  });
}

export async function refundCustomerPrepaymentCommand(
  input
){
  return await refundCustomerPrepayment({
    ...input,
    system_automation: false,
  });
}
