import { emitPOS, POS_EVENTS } from '@/lib/shared/realtime/posEventBus'
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function updateTableStatus({
  table_id,
  table_number,
  status,
  current_guests = 0,
  active_order_id = null,
}) {

  try {

    const { data, error } = await supabaseAdmin
      .from("pos_tables")
      .update({
        status,
        active_order_id,
      })
      .eq("id", table_id)
      .select()
      .single();

    if (error) throw error;

    // realtime sync (INSIDE function - correct scope)
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
