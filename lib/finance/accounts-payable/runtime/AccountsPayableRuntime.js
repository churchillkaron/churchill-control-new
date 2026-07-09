import { createVendorInvoice } from "../documents/createVendorInvoice.js";
import { runThreeWayMatch } from "../services/runThreeWayMatch.js";
import { createAccountsPayableEntry } from "../services/createAccountsPayableEntry.js";
import { processVendorPayment } from "../../payments/services/processVendorPayment.js";

export const AccountsPayableRuntime = {

  async createVendorInvoiceCommand(input) {
    return createVendorInvoice(input);
  },

  async runThreeWayMatchCommand(input) {
    return runThreeWayMatch(input);
  },

  async createAccountsPayableEntryCommand(input) {
    return createAccountsPayableEntry(input);
  },

  async processVendorPaymentCommand(input) {
    return processVendorPayment(input);
  },

  // backward compatibility layer (important)
  async runAll(input) {

    const invoice = await createVendorInvoice(input);

    const match = await runThreeWayMatch(input);

    const ap = await createAccountsPayableEntry(input);

    return {
      invoice,
      match,
      ap,
    };
  }
};
