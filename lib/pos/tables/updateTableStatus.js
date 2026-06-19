import { emitPOS, POS_EVENTS } from "@/lib/shared/realtime/posEventBus";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function updateTableStatus({
  table_id,
  table_number,
  status,
  current_guests,
  active_session_id,
}) {
  try {
    const { data, error } = await supabaseAdmin
      .from("restaurant_tables")
      .update({
        status,
        current_guests,
        active_session_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", table_id)
      .select()
      .single();

    if (error) throw error;

    emitPOS(POS_EVENTS.TABLE_UPDATED, {
      table_id,
      table_number,
      status,
      current_guests,
    });

    return {
      success: true,
      table: data,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
