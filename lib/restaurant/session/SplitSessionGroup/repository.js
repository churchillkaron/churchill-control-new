import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function repository({
  organizationId,
  payload,
}) {
  const now = new Date().toISOString();

  const sessionId =
    payload.sessionId || payload.session_id;

  const fromTableId =
    payload.fromTableId || payload.from_table_id;

  const newTableId =
    payload.newTableId || payload.new_table_id;

  const splitGuestCount =
    payload.guestCount || 0;

  if (!sessionId || !fromTableId || !newTableId) {
    throw new Error("sessionId, fromTableId, newTableId required");
  }

  // 1. Reduce guest count on original session
  await supabaseAdmin
    .from("table_sessions")
    .update({
      guest_count: supabaseAdmin.raw
        ? undefined
        : undefined,
      updated_at: now,
    })
    .eq("entity_id", organizationId)
    .eq("id", sessionId);

  // 2. Create new session for split table
  const { data: newSession, error: sessionError } =
    await supabaseAdmin
      .from("table_sessions")
      .insert({
        organization_id: organizationId,
        table_id: newTableId,
        table_number: payload.newTableNumber || null,
        guest_count: splitGuestCount,
        status: "OPEN",
        opened_at: now,
        updated_at: now,
      })
      .select()
      .single();

  if (sessionError) {
    throw sessionError;
  }

  // 3. Move orders to new table
  await supabaseAdmin
    .from("orders")
    .update({
      table_id: newTableId,
      updated_at: now,
    })
    .eq("entity_id", organizationId)
    .eq("table_id", fromTableId)
    .limit(splitGuestCount);

  // 4. Move items
  await supabaseAdmin
    .from("order_items")
    .update({
      table_id: newTableId,
      updated_at: now,
    })
    .eq("entity_id", organizationId)
    .eq("table_id", fromTableId);

  // 5. Update table states
  await supabaseAdmin
    .from("restaurant_tables")
    .update({
      status: "OCCUPIED",
      active_session_id: newSession.id,
      updated_at: now,
    })
    .eq("entity_id", organizationId)
    .eq("id", newTableId);

  await supabaseAdmin
    .from("restaurant_tables")
    .update({
      current_guests:
        Math.max(0, splitGuestCount),
      updated_at: now,
    })
    .eq("entity_id", organizationId)
    .eq("id", fromTableId);

  return {
    success: true,
    sessionId,
    newSessionId: newSession.id,
    fromTableId,
    newTableId,
  };
}
