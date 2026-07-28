import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function normalizeKey(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeDate(value) {
  const candidate = value ? new Date(value) : new Date();

  if (Number.isNaN(candidate.getTime())) {
    throw new Error("postingDate must be a valid date");
  }

  return candidate.toISOString().slice(0, 10);
}

async function findCanonicalPostingRule({
  organizationId,
  entityId,
  eventType,
  sourceModule,
  postingDate,
}) {
  let query = supabaseAdmin
    .from("finance_posting_rules")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("event_type", eventType)
    .eq("status", "ACTIVE")
    .lte("effective_from", postingDate)
    .or(`effective_to.is.null,effective_to.gte.${postingDate}`)
    .order("priority", { ascending: true })
    .order("effective_from", { ascending: false })
    .limit(1);

  query = entityId
    ? query.eq("entity_id", entityId)
    : query.is("entity_id", null);

  if (sourceModule) {
    query = query.eq("source_module", sourceModule);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return data || null;
}

async function findLegacyPostingRule({
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
    const missingRelation = ["42P01", "PGRST204", "PGRST205"].includes(
      String(error.code || "")
    );

    if (missingRelation) return null;
    throw error;
  }

  return data || null;
}

export async function getPostingRule({
  organizationId,
  entityId = null,
  eventType,
  sourceModule = null,
  postingDate = null,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const normalizedEventType = normalizeKey(eventType);
  if (!normalizedEventType) {
    throw new Error("eventType required");
  }

  const normalizedSourceModule = sourceModule
    ? normalizeKey(sourceModule)
    : null;
  const resolvedPostingDate = normalizeDate(postingDate);

  const entityRule = entityId
    ? await findCanonicalPostingRule({
        organizationId,
        entityId,
        eventType: normalizedEventType,
        sourceModule: normalizedSourceModule,
        postingDate: resolvedPostingDate,
      })
    : null;

  if (entityRule) return entityRule;

  const organizationRule = await findCanonicalPostingRule({
    organizationId,
    entityId: null,
    eventType: normalizedEventType,
    sourceModule: normalizedSourceModule,
    postingDate: resolvedPostingDate,
  });

  if (organizationRule) return organizationRule;

  const legacyEntityRule = entityId
    ? await findLegacyPostingRule({
        organizationId,
        entityId,
        eventType: normalizedEventType,
      })
    : null;

  if (legacyEntityRule) return legacyEntityRule;

  const legacyOrganizationRule = await findLegacyPostingRule({
    organizationId,
    entityId: null,
    eventType: normalizedEventType,
  });

  if (legacyOrganizationRule) return legacyOrganizationRule;

  throw new Error(
    `No posting rule configured for ${normalizedEventType}`
  );
}
