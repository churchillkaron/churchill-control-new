import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function publishPOSEvent({
  tenant_id,
  event_type,
  entity_type,
  entity_id = null,
  payload = {},
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("pos_realtime_events")
      .insert([
        {

          tenant_id,

          event_type,

          entity_type,

          entity_id,

          payload,

          status:
            "PUBLISHED",

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
