import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function repository({
  organizationId,
  payload = {},
}) {
  const sessionId =
    payload.sessionId || payload.session_id;

  if (!sessionId) {
    throw new Error("sessionId required");
  }

  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("table_sessions")
    .update({
      status: "CLOSED",
      closed_at: now,
      updated_at: now,
    })
    .eq("entity_id", organizationId)
    .eq("id", sessionId)
    .select()
    .single();

  if (error) throw error;

  await supabaseAdmin
    .from("restaurant_tables")
    .update({
      status: "AVAILABLE",
      active_session_id: null,
      current_guests: 0,
      updated_at: now,
    })
    .eq("entity_id", organizationId)
    .eq("active_session_id", sessionId);

  return data;
}
