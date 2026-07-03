import { supabase } from "@/lib/shared/supabase/client";

export async function getActiveTableSession({ tableId, organizationId }) {
  if (!tableId) throw new Error("tableId required");

  const { data, error } = await supabase
    .from("table_sessions")
    .select("*")
    .eq("table_id", tableId)
    .eq("organization_id", organizationId)
    .single();

  if (error) {
    return null;
  }

  return data;
}
