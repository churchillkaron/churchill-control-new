import { supabase } from "@/lib/supabase";

export async function getEventProcessingStatus({
  tenantId,
}) {
  const { data, error } =
    await supabase
      .from("accounting_event_bus")
      .select(`
        status
      `)
      .eq("tenant_id", tenantId);

  if (error) {
    throw error;
  }

  const summary = {
    pending: 0,
    processing: 0,
    posted: 0,
    failed: 0,
    dead_letter: 0,
  };

  for (const row of data || []) {
    if (
      summary[row.status] !==
      undefined
    ) {
      summary[row.status] += 1;
    }
  }

  return summary;
}
