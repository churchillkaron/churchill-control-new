import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function processPOSPayment({
  tenant_id,
  order_id,
  payment_type,
  amount_paid,
  reference_number,
}) {

  try {

    const {
      data: order,
      error: orderError,
    } = await supabaseAdmin
      .from("pos_orders")
      .select(`
        id,
        total,
        status
      `)
      .eq(
        "id",
        order_id
      )
      .single();

    if (orderError) {
      throw orderError;
    }

    const total =
      Number(
        order.total || 0
      );

    const paid =
      Number(
        amount_paid || 0
      );

    if (
      paid < total
    ) {

      return {

        success: false,

        error:
          "INSUFFICIENT_PAYMENT",
      };
    }

    const change =
      Number(
        (
          paid - total
        ).toFixed(2)
      );

    const {
      data: payment,
      error: paymentError,
    } = await supabaseAdmin
      .from("pos_payments")
      .insert([
        {

          tenant_id,

          order_id,

          payment_type,

          amount_paid:
            paid,

          total_amount:
            total,

          change_amount:
            change,

          reference_number:
            reference_number || null,

          created_at:
            new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (paymentError) {
      throw paymentError;
    }

    const {
      error: updateError,
    } = await supabaseAdmin
      .from("pos_orders")
      .update({

        status:
          "COMPLETED",
      })
      .eq(
        "id",
        order_id
      );

    if (updateError) {
      throw updateError;
    }

    return {

      success: true,

      payment,

      receipt: {

        order_id,

        total,

        paid,

        change,

        payment_type,
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
