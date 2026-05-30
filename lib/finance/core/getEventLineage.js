import { supabase } from "@/lib/supabase";

export async function getEventLineage({
  tenantId,
  eventId,
}) {
  const { data, error } =
    await supabase
      .from(
        "accounting_event_lineage"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("event_id", eventId)
      .single();

  if (error) {
    throw error;
  }

  return data;
}
