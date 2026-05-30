import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  createJournalEntry,
} from "@/lib/finance/accounting/createJournalEntry";

async function findAccount({
  tenantId,
  codes = [],
  categories = [],
  nameIncludes = [],
}) {

  let query =
    supabaseAdmin
      .from("chart_of_accounts")
      .select("*");

  if (tenantId) {

    query =
      query.eq(
        "tenant_id",
        tenantId
      );

  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    throw error;
  }

  const accounts =
    data || [];

  return accounts.find((account) =>
    codes.includes(account.code)
  ) || accounts.find((account) =>
    categories.includes(account.category)
  ) || accounts.find((account) =>
    nameIncludes.some((word) =>
      String(account.name || "")
        .toLowerCase()
        .includes(word)
    )
  );

}

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

        codes: [
          "1200",
          "1300",
          "1350",
        ],

        categories: [
          "Assets",
        ],

        nameIncludes: [
          "inventory",
          "stock",
        ],

      });

    const grniAccount =
      await findAccount({

        tenantId,

        codes: [
          "2100",
          "2200",
          "2250",
        ],

        categories: [
          "Liabilities",
        ],

        nameIncludes: [
          "grni",
          "goods received not invoiced",
          "accrued purchases",
        ],

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
