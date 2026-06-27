import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function repository({
  organizationId,
  payload,
}) {
  const now = new Date().toISOString();

  const fromTableId =
    payload.fromTableId || payload.from_table_id;

  const toTableId =
    payload.toTableId || payload.to_table_id;

  const sessionId =
    payload.sessionId || payload.session_id;

  const guestCount =
    payload.guestCount || 0;

  if (!fromTableId || !toTableId) {
    throw new Error("fromTableId and toTableId required");
  }

  // 1. Move session reference
  const { error: sessionError } = await supabaseAdmin
    .from("table_sessions")
    .update({
      table_id: toTableId,
      updated_at: now,
    })
    .eq("entity_id", organizationId)
    .eq("id", sessionId);

  if (sessionError) {
    throw sessionError;
  }

  // 2. Move all orders
  const { error: orderError } = await supabaseAdmin
    .from("orders")
    .update({
      table_id: toTableId,
      updated_at: now,
    })
    .eq("entity_id", organizationId)
    .eq("table_id", fromTableId);

  if (orderError) {
    throw orderError;
  }

  // 3. Move order items
  const { error: itemError } = await supabaseAdmin
    .from("order_items")
    .update({
      table_id: toTableId,
      updated_at: now,
    })
    .eq("entity_id", organizationId)
    .eq("table_id", fromTableId);

  if (itemError) {
    throw itemError;
  }

  // 4. Update tables state
  await supabaseAdmin
    .from("restaurant_tables")
    .update({
      status: "AVAILABLE",
      active_session_id: null,
      current_guests: 0,
      updated_at: now,
    })
    .eq("entity_id", organizationId)
    .eq("id", fromTableId);

  await supabaseAdmin
    .from("restaurant_tables")
    .update({
      status: "OCCUPIED",
      active_session_id: sessionId,
      current_guests: guestCount,
      updated_at: now,
    })
    .eq("entity_id", organizationId)
    .eq("id", toTableId);

  return {
    success: true,
    fromTableId,
    toTableId,
    sessionId,
  };
}
