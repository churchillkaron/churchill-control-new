import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function moveGuestsBetweenTables({
  organizationId,
  sourceTableId,
  targetTableId,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!sourceTableId || !targetTableId) {
    throw new Error("sourceTableId and targetTableId required");
  }

  await supabaseAdmin
    .from("table_sessions")
    .update({
      table_id: targetTableId,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("table_id", sourceTableId);

  await supabaseAdmin
    .from("restaurant_tables")
    .update({
      current_guests: 0,
      active_session_id: null,
      status: "AVAILABLE",
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("id", sourceTableId);

  return { success: true };
}
