import {
  upsertPaymentTerm,
  archivePaymentTerm,
} from "../repositories/paymentTermRepository";


export async function upsertPaymentTermCommand(input) {

  return await upsertPaymentTerm(input);

}


export async function archivePaymentTermCommand(input) {

  return await archivePaymentTerm(input);

}
