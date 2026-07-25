import { createVendorInvoice } from "../documents/createVendorInvoice.js";
import runThreeWayMatch from "../workflows/runThreeWayMatch.js";
import approveVendorInvoice from "../workflows/approveVendorInvoice.js";
import createAccountsPayableEntry from "../capabilities/createAccountsPayableEntry.js";
import processVendorPayment from "../../payments/capabilities/processVendorPayment.js";

function invoiceRecord(result) {
  return (
    result?.invoice ||
    result?.data?.invoice ||
    result?.result?.invoice ||
    null
  );
}

export const AccountsPayableRuntime = {
  async createVendorInvoiceCommand(input) {
    return createVendorInvoice(input);
  },

  async runThreeWayMatchCommand(input) {
    return runThreeWayMatch(input);
  },

  async approveVendorInvoiceCommand(input) {
    return approveVendorInvoice(input);
  },

  async createAccountsPayableEntryCommand(input) {
    return createAccountsPayableEntry(input);
  },

  async processVendorPaymentCommand(input) {
    return processVendorPayment(input);
  },

  async runAll(input) {
    const created = await createVendorInvoice(input);
    const invoice = invoiceRecord(created);

    if (!invoice?.id) {
      throw new Error(
        "Atomic vendor invoice creation did not return an invoice"
      );
    }

    let match = null;

    if (
      invoice.purchase_order_id &&
      invoice.goods_receipt_id
    ) {
      match = await runThreeWayMatch({
        organization_id: invoice.organization_id,
        entity_id: invoice.entity_id,
        vendor_invoice_id: invoice.id,
        matched_by:
          input?.createdBy ||
          input?.created_by ||
          input?.authenticated_actor_id ||
          null,
      });

      if (match?.success === false) {
        throw new Error(
          match.error || "Three-way match failed"
        );
      }
    }

    return {
      success: true,
      invoice: created,
      match,
      payable:
        created?.payable ||
        created?.data?.payable ||
        created?.result?.payable ||
        null,
    };
  },
};
