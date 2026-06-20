import {
  createJournalEntry,
} from "@/lib/finance/accounting/createJournalEntry";

import { findAccount }
from "@/lib/finance/accounting/findAccount";

export default async function
postPaymentAccounting({

  tenantId,

  paymentId,

  payment,

  createdBy = "system",

}) {

  const totalAmount =
    Number(
      payment?.amount || 0
    );

  if (totalAmount <= 0) {

    return {
      success: false,
      error:
        "INVALID_PAYMENT_AMOUNT",
    };

  }

  const apAccount =
    await findAccount({
      tenantId,
      code: "2000",
    });

  const cashAccount =
    await findAccount({
      tenantId,
      code: "1000",
    });

  if (
    !apAccount ||
    !cashAccount
  ) {

    return {
      success: false,
      error:
        "AP_OR_CASH_ACCOUNT_MISSING",
    };

  }

  return await createJournalEntry({

    tenantId,

    entryDate:
      new Date()
        .toISOString()
        .slice(0, 10),

    description:
      `Payment completed ${paymentId}`,

    sourceType:
      "payment",

    sourceId:
      paymentId,

    createdBy,

    lines: [

      {

        account_id:
          apAccount.id,

        debit:
          totalAmount,

        credit:
          0,

        description:
          "Reduce AP liability",

      },

      {

        account_id:
          cashAccount.id,

        debit:
          0,

        credit:
          totalAmount,

        description:
          "Cash payment",

      },

    ],

  });

}
