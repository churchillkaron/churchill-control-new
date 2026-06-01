import {
  createJournalEntry,
} from "@/lib/finance/accounting/createJournalEntry";

import {
  findAccount,
} from "@/lib/finance/accounting/findAccount";

export default async function
postInvoiceApprovalAccounting({

  tenantId,

  invoiceId,

  invoice,

  createdBy = "system",

}) {

  const totalAmount =
    Number(
      invoice?.total_amount || 0
    );

  if (totalAmount <= 0) {

    return {
      success: false,
      error:
        "INVALID_INVOICE_AMOUNT",
    };

  }

  const grniAccount =
    await findAccount({
      tenantId,
      code: "2250",
    });

  const apAccount =
    await findAccount({
      tenantId,
      code: "2000",
    });

  if (
    !grniAccount ||
    !apAccount
  ) {

    return {
      success: false,
      error:
        "AP_OR_GRNI_ACCOUNT_MISSING",
    };

  }

  return await createJournalEntry({

    tenantId,

    entryDate:
      new Date()
        .toISOString()
        .slice(0, 10),

    description:
      `Invoice approval ${invoiceId}`,

    sourceType:
      "vendor_invoice",

    sourceId:
      invoiceId,

    createdBy,

    lines: [

      {

        account_id:
          grniAccount.id,

        debit:
          totalAmount,

        credit:
          0,

        description:
          "Reverse GRNI accrual",

      },

      {

        account_id:
          apAccount.id,

        debit:
          0,

        credit:
          totalAmount,

        description:
          "Accounts payable liability",

      },

    ],

  });

}
