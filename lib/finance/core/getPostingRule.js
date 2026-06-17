import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function getPostingRule({
  tenantId,
  eventType,
}) {
  const { data, error } = await supabase
    .from("accounting_posting_rules")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("event_type", eventType)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    throw new Error("No posting rule found for event type");
  }

  return data;
}
