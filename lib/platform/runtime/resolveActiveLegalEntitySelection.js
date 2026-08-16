import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const ACTIVE_ENTITY_COOKIE = "avantiqo_active_entity_id";

function normalizeId(value) {
  return String(value || "").trim() || null;
}

export function readActiveEntityId(request) {
  const cookieValue = normalizeId(
    request?.cookies?.get?.(ACTIVE_ENTITY_COOKIE)?.value
  );

  if (cookieValue) return cookieValue;

  const cookieHeader = String(request?.headers?.get?.("cookie") || "");
  const prefix = `${ACTIVE_ENTITY_COOKIE}=`;

  for (const part of cookieHeader.split(";")) {
    const value = part.trim();
    if (!value.startsWith(prefix)) continue;

    try {
      return normalizeId(decodeURIComponent(value.slice(prefix.length)));
    } catch {
      return normalizeId(value.slice(prefix.length));
    }
  }

  return null;
}

export async function loadActiveLegalEntities({ organizationId }) {
  const { data, error } = await supabaseAdmin
    .from("legal_entities")
    .select(
      "id,organization_id,legal_name,display_name,code,country,currency,is_default_accounting_entity"
    )
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("is_default_accounting_entity", { ascending: false })
    .order("legal_name", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function resolveActiveLegalEntitySelection({
  request,
  organizationId,
  entityId = null,
}) {
  const explicitEntityId = normalizeId(entityId);
  const sessionEntityId = explicitEntityId ? null : readActiveEntityId(request);
  const entities = await loadActiveLegalEntities({ organizationId });

  if (!entities.length) {
    throw new Error("No active legal entity is configured for this organization");
  }

  if (explicitEntityId) {
    const entity = entities.find((item) => item.id === explicitEntityId) || null;

    if (!entity) {
      throw new Error("Legal entity does not belong to this organization");
    }

    return { entity, entities, source: "explicit" };
  }

  if (sessionEntityId) {
    const entity = entities.find((item) => item.id === sessionEntityId) || null;

    if (entity) {
      return { entity, entities, source: "session" };
    }
  }

  const defaultEntity =
    entities.find((item) => item.is_default_accounting_entity === true) || null;

  if (defaultEntity) {
    return { entity: defaultEntity, entities, source: "default" };
  }

  if (entities.length === 1) {
    return { entity: entities[0], entities, source: "single" };
  }

  throw new Error(
    "Legal entity selection is required because this organization has multiple active legal entities"
  );
}
