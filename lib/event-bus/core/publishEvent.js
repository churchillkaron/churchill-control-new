import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function publishEvent({
  tenant_id,
  event_type,
  payload = {},
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("event_bus")
      .insert([
        {

          tenant_id,

          event_type,

          payload,

          status:
            "PENDING",

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

      event:
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
