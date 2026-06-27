import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getPostingRule({
  organizationId,
  entityId,
  eventType,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!entityId) {
    throw new Error("entityId required");
  }

  const { data, error } = await supabaseAdmin
    .from("accounting_posting_rules")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("event_type", eventType)
    .eq("is_active", true)
    .single();

  if (error) {
    throw error;
  }

  return data;
}
