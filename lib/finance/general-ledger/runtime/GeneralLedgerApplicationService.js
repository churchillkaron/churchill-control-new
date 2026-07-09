import requestJournalReversal from "../capabilities/requestJournalReversal";
import createJournalReversal from "../capabilities/createJournalReversal";
import { postVendorPaymentGL } from "../capabilities/postVendorPaymentGL";
import { postDepreciationToLedger } from "../capabilities/postDepreciationToLedger";

export async function requestJournalReversalCommand(input) {
  return await requestJournalReversal(input);
}

export async function createJournalReversalCommand(input) {
  return await createJournalReversal(input);
}

export async function postVendorPaymentGLCommand(input) {
  return await postVendorPaymentGL(input);
}

export async function postDepreciationToLedgerCommand(input) {
  return await postDepreciationToLedger(input);
}
