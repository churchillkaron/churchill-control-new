import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function openShift({
  tenant_id,
  staff_id,
  staff_name,
  opening_cash = 0,
}) {

  try {

    const {
      data: existingShift,
    } = await supabaseAdmin
      .from("pos_shifts")
      .select("id")
      .eq(
        "tenant_id",
        tenant_id
      )
      .eq(
        "staff_id",
        staff_id
      )
      .eq(
        "status",
        "OPEN"
      )
      .maybeSingle();

    if (existingShift) {

      return {

        success: false,

        error:
          "SHIFT_ALREADY_OPEN",
      };
    }

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("pos_shifts")
      .insert([
        {

          tenant_id,

          staff_id,

          staff_name,

          opening_cash,

          status:
            "OPEN",

          opened_at:
            new Date().toISOString(),
        },
      ])
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
