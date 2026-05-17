import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function buildAutonomousAccountingClose({
  tenant_id,
}) {

  try {

    const [
      journalsResponse,
      paymentsResponse,
      invoicesResponse,
    ] = await Promise.all([

      supabaseAdmin
        .from("journal_entries")
        .select(`
          id,
          debit,
          credit,
          created_at
        `)
        .eq(
          "tenant_id",
          tenant_id
        )
        .limit(10000),

      supabaseAdmin
        .from("payments")
        .select(`
          id,
          amount,
          created_at
        `)
        .eq(
          "tenant_id",
          tenant_id
        )
        .limit(10000),

      supabaseAdmin
        .from("vendor_invoices")
        .select(`
          id,
          total_amount,
          status,
          created_at
        `)
        .eq(
          "tenant_id",
          tenant_id
        )
        .limit(10000),
    ]);

    if (
      journalsResponse.error
    ) {
      throw journalsResponse.error;
    }

    if (
      paymentsResponse.error
    ) {
      throw paymentsResponse.error;
    }

    if (
      invoicesResponse.error
    ) {
      throw invoicesResponse.error;
    }

    const journals =
      journalsResponse.data || [];

    const payments =
      paymentsResponse.data || [];

    const invoices =
      invoicesResponse.data || [];

    const totalDebit =
      journals.reduce(
        (
          sum,
          entry
        ) =>
          sum +
          Number(
            entry.debit || 0
          ),
        0
      );

    const totalCredit =
      journals.reduce(
        (
          sum,
          entry
        ) =>
          sum +
          Number(
            entry.credit || 0
          ),
        0
      );

    const totalPayments =
      payments.reduce(
        (
          sum,
          payment
        ) =>
          sum +
          Number(
            payment.amount || 0
          ),
        0
      );

    const outstandingInvoices =
      invoices.filter(
        (invoice) =>
          invoice.status !==
          "PAID"
      );

    const accountingClose = {

      balanced:
        Number(
          totalDebit.toFixed(2)
        ) ===
        Number(
          totalCredit.toFixed(2)
        ),

      total_debit:
        Number(
          totalDebit.toFixed(2)
        ),

      total_credit:
        Number(
          totalCredit.toFixed(2)
        ),

      total_payments:
        Number(
          totalPayments.toFixed(2)
        ),

      outstanding_invoices:
        outstandingInvoices.length,

      close_status:
        "PENDING",
    };

    if (
      accountingClose.balanced &&
      outstandingInvoices.length === 0
    ) {

      accountingClose.close_status =
        "READY_TO_CLOSE";
    }

    if (
      !accountingClose.balanced
    ) {

      accountingClose.close_status =
        "UNBALANCED_LEDGER";
    }

    await supabaseAdmin
      .from("accounting_close_reports")
      .insert([
        {

          tenant_id,

          total_debit:
            accountingClose.total_debit,

          total_credit:
            accountingClose.total_credit,

          total_payments:
            accountingClose.total_payments,

          outstanding_invoices:
            accountingClose.outstanding_invoices,

          balanced:
            accountingClose.balanced,

          close_status:
            accountingClose.close_status,

          created_at:
            new Date().toISOString(),
        },
      ]);

    return {

      success: true,

      accounting_close:
        accountingClose,

      generated_at:
        new Date().toISOString(),
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
