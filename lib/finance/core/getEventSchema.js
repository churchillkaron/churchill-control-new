import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function getEventSchema({
  tenantId,
  eventType,
  schemaVersion = "v1",
}) {
  const { data, error } =
    await supabase
      .from("accounting_event_schemas")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("event_type", eventType)
      .eq(
        "schema_version",
        schemaVersion
      )
      .single();

  if (error || !data) {
    throw new Error(
      "Event schema not found"
    );
  }

  return data;
}
