import { createVendorInvoice } from "../documents/createVendorInvoice";
import runThreeWayMatch from "../workflows/runThreeWayMatch";
import approveVendorInvoice from "../workflows/approveVendorInvoice";
import createAccountsPayableEntry from "../capabilities/createAccountsPayableEntry";
import processVendorPayment from "../../payments/capabilities/processVendorPayment";

export async function AccountsPayableApplicationService(input) {
  const { type, payload } = input || {};

  switch (String(type || "").trim().toUpperCase()) {
    case "CREATE_VENDOR_INVOICE":
      return createVendorInvoice(payload);

    case "THREE_WAY_MATCH":
      return runThreeWayMatch(payload);

    case "APPROVE_VENDOR_INVOICE":
      return approveVendorInvoice(payload);

    case "RESOLVE_AP_ENTRY":
    case "CREATE_AP_ENTRY":
      return createAccountsPayableEntry(payload);

    case "PROCESS_VENDOR_PAYMENT":
      return processVendorPayment(payload);

    default:
      throw new Error(`UNKNOWN_AP_COMMAND: ${type}`);
  }
}
