import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function publishEvent({
  tenant_id,
  type,
  payload = {},
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("system_events")
      .insert([
        {
          tenant_id,
          type,
          payload,
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
      event: data,
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
