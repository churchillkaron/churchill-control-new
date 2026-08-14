import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getExecutiveKPIs } from "@/lib/finance/reporting/reports/getExecutiveKPIs";

function normalizeEntityIds(values) {
  if (!Array.isArray(values)) return null;

  return [
    ...new Set(
      values
        .map((value) => {
          if (typeof value === "string") return value;
          return value?.id || value?.entity_id || null;
        })
        .filter(Boolean)
    ),
  ];
}

export async function getEntityRanking({
  organizationId,
  entityIds = null,
} = {}) {
  if (!organizationId) throw new Error("organizationId required");

  const requestedEntityIds = normalizeEntityIds(entityIds);

  if (Array.isArray(requestedEntityIds) && requestedEntityIds.length === 0) {
    return [];
  }

  let entityQuery = supabaseAdmin
    .from("legal_entities")
    .select(
      "id, code, legal_name, display_name, is_active, is_default_accounting_entity"
    )
    .eq("organization_id", organizationId);

  if (requestedEntityIds?.length) {
    entityQuery = entityQuery.in("id", requestedEntityIds);
  }

  const { data: entityRows, error: entityError } = await entityQuery
    .order("is_default_accounting_entity", { ascending: false })
    .order("legal_name", { ascending: true });

  if (entityError) throw entityError;

  const entities = (entityRows || []).filter((entity) => entity.is_active !== false);

  const ranked = await Promise.all(
    entities.map(async (entity) => {
      const metrics = await getExecutiveKPIs({
        organizationId,
        entityId: entity.id,
      });

      return {
        organization_id: organizationId,
        entity_id: entity.id,
        entity_name:
          entity.display_name ||
          entity.legal_name ||
          entity.code ||
          "Unnamed entity",
        revenue: Number(metrics.revenue || 0),
        net_profit: Number(metrics.net_operating_result || 0),
        margin: Number(metrics.net_operating_margin || 0),
      };
    })
  );

  return ranked
    .sort((a, b) => b.margin - a.margin)
    .map((row, index) => ({
      ...row,
      ranking_position: index + 1,
    }));
}
