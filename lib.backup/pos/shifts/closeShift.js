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

    const expectedCash =
      Number(
        shift.opening_cash || 0
      );

    const variance =
      Number(
        (
          Number(closing_cash) -
          expectedCash
        ).toFixed(2)
      );

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("pos_shifts")
      .update({

        closing_cash,

        cash_variance:
          variance,

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
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
