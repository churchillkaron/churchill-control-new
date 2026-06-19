import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function closeShift({
  shift_id,
  closing_cash = 0,
}) {

  try {

    const {
      data: shift,
      error: shiftError,
    } = await supabaseAdmin

      .from("pos_shifts")

      .select("*")

      .eq(
        "id",
        shift_id
      )

      .single();

    if (shiftError) {
      throw shiftError;
    }

    // =========================
    // LOAD PAYMENTS
    // =========================

    const {
      data: payments,
      error: paymentError,
    } = await supabaseAdmin

      .from("payment_transactions")

      .select("*");

    if (paymentError) {
      throw paymentError;
    }

    const validPayments =
      (payments || []).filter(
        payment =>

          payment.payment_status !==
          "VOIDED"
      );

    // =========================
    // TOTALS
    // =========================

    const cashTotal =
      validPayments

        .filter(
          payment =>
            payment.payment_type ===
            "CASH"
        )

        .reduce(
          (
            sum,
            payment
          ) =>

            sum +

            Number(
              payment.amount_paid || 0
            ),

          0
        );

    const cardTotal =
      validPayments

        .filter(
          payment =>
            payment.payment_type ===
            "CARD"
        )

        .reduce(
          (
            sum,
            payment
          ) =>

            sum +

            Number(
              payment.amount_paid || 0
            ),

          0
        );

    const qrTotal =
      validPayments

        .filter(
          payment =>
            payment.payment_type ===
            "QR"
        )

        .reduce(
          (
            sum,
            payment
          ) =>

            sum +

            Number(
              payment.amount_paid || 0
            ),

          0
        );

    const reversalTotal =
      (payments || [])

        .filter(
          payment =>
            payment.payment_type ===
            "REVERSAL"
        )

        .reduce(
          (
            sum,
            payment
          ) =>

            sum +

            Math.abs(
              Number(
                payment.amount_paid || 0
              )
            ),

          0
        );

    // =========================
    // NET SALES
    // =========================

    const netSales =
      Number(
        (
          cashTotal +
          cardTotal +
          qrTotal -
          reversalTotal
        ).toFixed(2)
      );

    // =========================
    // EXPECTED CASH
    // =========================

    const expectedCash =
      Number(
        (
          Number(
            shift.opening_cash || 0
          ) +

          cashTotal
        ).toFixed(2)
      );

    // =========================
    // VARIANCE
    // =========================

    const variance =
      Number(
        (
          Number(closing_cash) -
          expectedCash
        ).toFixed(2)
      );

    // =========================
    // UPDATE SHIFT
    // =========================

    const {
      data,
      error,
    } = await supabaseAdmin

      .from("pos_shifts")

      .update({

        closing_cash,

        expected_cash:
          expectedCash,

        variance,

        cash_total:
          cashTotal,

        card_total:
          cardTotal,

        qr_total:
          qrTotal,

        reversal_total:
          reversalTotal,

        net_sales:
          netSales,

        status:
          "CLOSED",

        closed_at:
          new Date().toISOString(),

      })

      .eq(
        "id",
        shift_id
      )

      .select()

      .single();

    if (error) {
      throw error;
    }

    return {

      success: true,

      shift:
        data,

      reconciliation: {

        opening_cash:
          shift.opening_cash,

        cash_total:
          cashTotal,

        card_total:
          cardTotal,

        qr_total:
          qrTotal,

        reversal_total:
          reversalTotal,

        expected_cash:
          expectedCash,

        counted_cash:
          closing_cash,

        variance,

        net_sales:
          netSales,

      },

    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };

  }

}
