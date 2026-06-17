import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import { createJournalEntry }
from "./createJournalEntry";

// =====================================
// POST PAYMENT TO LEDGER
// =====================================

export async function postPaymentToLedger({

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

    .eq("tenant_id", tenantId)

    .single();

  if (invoiceError) {

    throw invoiceError;

  }

  // -----------------------------------
  // LOAD ACCOUNTS
  // -----------------------------------

  const {
    data: apAccount,
  } = await supabaseAdmin

    .from("chart_of_accounts")

    .select("*")

    .eq("tenant_id", tenantId)

    .eq(
      "code",
      "2000"
    )

    .single();

  const {
    data: bankAccount,
  } = await supabaseAdmin

    .from("chart_of_accounts")

    .select("*")

    .eq("tenant_id", tenantId)

    .eq(
      "code",
      "1100"
    )

    .single();

  if (
    !apAccount ||
    !bankAccount
  ) {

    throw new Error(
      "Required payment accounts missing"
    );

  }

  // -----------------------------------
  // CREATE JOURNAL ENTRY
  // -----------------------------------

  return await createJournalEntry({

    tenantId,

    entryDate:
      new Date()
        .toISOString()
        .slice(0, 10),

    description:
      `Invoice Payment ${invoice.id}`,

    sourceType:
      "invoice_payment",

    sourceId:
      invoice.id,

    createdBy,

    lines: [

      {

        account_id:
          apAccount.id,

        debit:
          Number(
            invoice.total_amount || 0
          ),

        credit:
          0,

        description:
          "Accounts payable settlement",

      },

      {

        account_id:
          bankAccount.id,

        debit:
          0,

        credit:
          Number(
            invoice.total_amount || 0
          ),

        description:
          "Bank payment",

      },

    ],

  });

}