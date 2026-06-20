import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  createJournalEntry,
} from "@/lib/finance/accounting/createJournalEntry";
import { findAccount } from "@/lib/finance/accounting/findAccount";

export default async function
postGoodsReceiptAccounting({

  tenantId,

  goodsReceiptId,

  purchaseOrder,

  createdBy = "system",

}) {

  try {

    const totalAmount =
      Number(
        purchaseOrder?.total_amount || 0
      );

    if (totalAmount <= 0) {

      return {
        success: false,
        error:
          "INVALID_RECEIPT_AMOUNT",
      };

    }

    const inventoryAccount =
      await findAccount({
        tenantId,
        code: "1200",
      });

    const grniAccount =
      await findAccount({
        tenantId,
        code: "2100",
      });

    if (
      !inventoryAccount ||
      !grniAccount
    ) {

      throw new Error(
        "Inventory or GRNI account missing"
      );

    }

    const journal =
      await createJournalEntry({

        tenantId,

        entryDate:
          new Date()
            .toISOString()
            .slice(0, 10),

        description:
          `Goods receipt ${goodsReceiptId}`,

        sourceType:
          "goods_receipt",

        sourceId:
          goodsReceiptId,

        createdBy,

        lines: [

          {

            account_id:
              inventoryAccount.id,

            debit:
              totalAmount,

            credit:
              0,

            description:
              "Inventory increase",

          },

          {

            account_id:
              grniAccount.id,

            debit:
              0,

            credit:
              totalAmount,

            description:
              "Goods received not invoiced",

          },

        ],

      });

    return {

      success: true,

      journal,

    };

  } catch (error) {

    console.error(
      "[GOODS_RECEIPT_ACCOUNTING_ERROR]",
      error
    );

    return {

      success: false,

      error:
        error.message,

    };

  }

}
