import { getServiceSupabase } from "@/lib/shared/supabase/service";

export async function closeTableSession({
  organizationId,
  sessionId,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const supabase = getServiceSupabase();

  const { data: session, error } = await supabase
    .from("table_sessions")
    .update({
      status: "CLOSED",
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("id", sessionId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  await supabase
    .from("restaurant_tables")
    .update({
      status: "AVAILABLE",
      current_guests: 0,
      active_session_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("active_session_id", sessionId);

  return session;
}
