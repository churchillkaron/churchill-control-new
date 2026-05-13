import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import { createJournalEntry }
from "./createJournalEntry";

// =====================================
// POST INVOICE TO LEDGER
// =====================================

export async function postInvoiceToLedger({

  tenantId,

  invoiceId,

  createdBy,

}) {

  // -----------------------------------
  // LOAD INVOICE
  // -----------------------------------

  const {
    data: invoice,
    error: invoiceError,
  } = await supabaseAdmin

    .from("invoices")

    .select("*")

    .eq("id", invoiceId)

    .single();

  if (invoiceError) {

    throw invoiceError;

  }

  // -----------------------------------
  // LOAD ACCOUNTS
  // -----------------------------------

  const {
    data: expenseAccount,
  } = await supabaseAdmin

    .from("chart_of_accounts")

    .select("*")

    .eq(
      "code",
      "6000"
    )

    .single();

  const {
    data: apAccount,
  } = await supabaseAdmin

    .from("chart_of_accounts")

    .select("*")

    .eq(
      "code",
      "2000"
    )

    .single();

  if (
    !expenseAccount ||
    !apAccount
  ) {

    throw new Error(
      "Required accounts missing"
    );

  }

  // -----------------------------------
  // CREATE JOURNAL ENTRY
  // -----------------------------------

  return await createJournalEntry({

    tenantId,

    entryDate:
      invoice.date,

    description:
      `Invoice ${invoice.id}`,

    sourceType:
      "invoice",

    sourceId:
      invoice.id,

    createdBy,

    lines: [

      {

        account_id:
          expenseAccount.id,

        debit:
          Number(
            invoice.total_amount || 0
          ),

        credit:
          0,

        description:
          "Expense recognition",

      },

      {

        account_id:
          apAccount.id,

        debit:
          0,

        credit:
          Number(
            invoice.total_amount || 0
          ),

        description:
          "Accounts payable",

      },

    ],

  });

}