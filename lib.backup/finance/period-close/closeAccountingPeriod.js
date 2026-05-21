import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function closeAccountingPeriod({
  tenant_id,
  period_name,
  start_date,
  end_date,
  closed_by = "ACCOUNTING",
}) {

  try {

    // ===== CHECK EXISTING =====
    const {
      data: existing,
    } = await supabaseAdmin
      .from("accounting_periods")
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      )
      .eq(
        "period_name",
        period_name
      )
      .maybeSingle();

    if (existing) {

      throw new Error(
        "PERIOD_ALREADY_EXISTS"
      );
    }

    // ===== CREATE PERIOD =====
    const {
      data,
      error,
    } = await supabaseAdmin
      .from("accounting_periods")
      .insert([
        {

          tenant_id,

          period_name,

          start_date,

          end_date,

          status:
            "CLOSED",

          closed_by,

          closed_at:
            new Date().toISOString(),

          created_at:
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

      accounting_period:
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
