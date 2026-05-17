import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function buildAIAccountingReconciliation({
  tenant_id,
}) {

  try {

    const [
      journalResponse,
      paymentResponse,
    ] = await Promise.all([

      supabaseAdmin
        .from("journal_entries")
        .select(`
          id,
          reference_no,
          debit,
          credit,
          description,
          created_at
        `)
        .eq(
          "tenant_id",
          tenant_id
        )
        .limit(5000),

      supabaseAdmin
        .from("payments")
        .select(`
          id,
          reference_no,
          amount,
          payment_method,
          created_at
        `)
        .eq(
          "tenant_id",
          tenant_id
        )
        .limit(5000),
    ]);

    if (
      journalResponse.error
    ) {
      throw journalResponse.error;
    }

    if (
      paymentResponse.error
    ) {
      throw paymentResponse.error;
    }

    const journals =
      journalResponse.data || [];

    const payments =
      paymentResponse.data || [];

    const reconciliation = [];

    let matched = 0;

    let unmatched = 0;

    for (const payment of payments) {

      const paymentAmount =
        Number(
          payment.amount || 0
        );

      const journal =
        journals.find(
          (entry) => {

            const debit =
              Number(
                entry.debit || 0
              );

            const credit =
              Number(
                entry.credit || 0
              );

            return (
              entry.reference_no ===
                payment.reference_no ||
              debit === paymentAmount ||
              credit === paymentAmount
            );
          }
        );

      if (journal) {

        matched += 1;

        reconciliation.push({

          status:
            "MATCHED",

          payment_id:
            payment.id,

          journal_id:
            journal.id,

          reference_no:
            payment.reference_no,

          amount:
            paymentAmount,

          confidence:
            "HIGH",
        });

      } else {

        unmatched += 1;

        reconciliation.push({

          status:
            "UNMATCHED",

          payment_id:
            payment.id,

          reference_no:
            payment.reference_no,

          amount:
            paymentAmount,

          confidence:
            "LOW",

          recommendation:
            "Manual review required.",
        });
      }
    }

    const reconciliationRate =
      payments.length > 0
        ? (
            (matched /
              payments.length) *
            100
          ).toFixed(2)
        : 0;

    return {

      success: true,

      summary: {

        total_payments:
          payments.length,

        matched,

        unmatched,

        reconciliation_rate:
          reconciliationRate,
      },

      reconciliation:
        reconciliation.slice(
          0,
          200
        ),

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
