import { supabaseAdmin } from "@/lib/shared/supabase/admin";

async function findPostingRule({
  organizationId,
  entityId,
  eventType,
}) {
  let query = supabaseAdmin
    .from("finance_posting_mappings")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("event_type", eventType)
    .eq("status", "ACTIVE");

  query = entityId
    ? query.eq("entity_id", entityId)
    : query.is("entity_id", null);

  const { data, error } = await query
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

export async function getPostingRule({
  organizationId,
  entityId = null,
  eventType,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!eventType) {
    throw new Error("eventType required");
  }

  const entityRule = entityId
    ? await findPostingRule({
        organizationId,
        entityId,
        eventType,
      })
    : null;

  if (entityRule) {
    return entityRule;
  }

  const organizationRule = await findPostingRule({
    organizationId,
    entityId: null,
    eventType,
  });

  if (!organizationRule) {
    throw new Error(
      `No posting rule configured for ${eventType}`
    );
  }

  return organizationRule;
}
