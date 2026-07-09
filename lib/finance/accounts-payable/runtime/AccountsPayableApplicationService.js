import { createVendorInvoice } from "../documents/createVendorInvoice";
import runThreeWayMatch from "../workflows/runThreeWayMatch";
import createAccountsPayableEntry from "../capabilities/createAccountsPayableEntry";

export async function AccountsPayableApplicationService(input) {
  const { type, payload } = input;

  switch (type) {

    case "CREATE_VENDOR_INVOICE":
      return await createVendorInvoice(payload);

    case "THREE_WAY_MATCH":
      return await runThreeWayMatch(payload);

    case "CREATE_AP_ENTRY":
      return await createAccountsPayableEntry(payload);

    default:
      throw new Error("UNKNOWN_AP_COMMAND: " + type);
  }
}
