import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function splitTableGroup({
  organizationId,
  masterTableId,
}) {
  if (!organizationId || !masterTableId) {
    return;
  }

  await supabaseAdmin
    .from("restaurant_table_merges")
    .delete()
    .eq("organization_id", organizationId)
    .eq("master_table_id", masterTableId);

  await supabaseAdmin
    .from("restaurant_tables")
    .update({
      status: "AVAILABLE",
      active_session_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId);

  return { success: true };
}
