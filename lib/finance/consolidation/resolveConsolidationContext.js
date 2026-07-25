import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function normalizeIds(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);

  return [...new Set(values.map(String))];
}

export async function resolveConsolidationContext({
  organizationId,
  entityIds = [],
  periodId = null,
  startDate = null,
  endDate = null,
} = {}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const { data: organizationEntities, error: entityError } =
    await supabaseAdmin
      .from("legal_entities")
      .select(`
        id,
        organization_id,
        legal_name,
        display_name,
        country,
        currency
      `)
      .eq("organization_id", organizationId)
      .order("legal_name", { ascending: true });

  if (entityError) {
    throw entityError;
  }

  const availableEntities = organizationEntities || [];

  if (!availableEntities.length) {
    throw new Error("No legal entities are configured for this organization");
  }

  const requestedIds = normalizeIds(entityIds);
  const availableById = new Map(
    availableEntities.map(entity => [String(entity.id), entity])
  );

  const selectedEntities = requestedIds.length
    ? requestedIds.map(id => availableById.get(id)).filter(Boolean)
    : availableEntities;

  const missingIds = requestedIds.filter(id => !availableById.has(id));

  if (missingIds.length) {
    throw new Error(
      `Entity scope is outside the organization: ${missingIds.join(", ")}`
    );
  }

  if (!selectedEntities.length) {
    throw new Error("At least one legal entity is required for consolidation");
  }

  const currencies = [...new Set(
    selectedEntities
      .map(entity => String(entity.currency || "").trim().toUpperCase())
      .filter(Boolean)
  )];

  if (currencies.length > 1) {
    throw new Error(
      "Cross-currency consolidation requires configured currency translation before balances can be combined"
    );
  }

  let period = null;

  if (periodId) {
    const { data, error } = await supabaseAdmin
      .from("accounting_periods")
      .select(`
        id,
        organization_id,
        entity_id,
        name,
        start_date,
        end_date,
        status
      `)
      .eq("organization_id", organizationId)
      .eq("id", periodId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error("Accounting period is outside the organization scope");
    }

    if (
      data.entity_id &&
      (
        selectedEntities.length !== 1 ||
        String(selectedEntities[0].id) !== String(data.entity_id)
      )
    ) {
      throw new Error(
        "An entity-specific accounting period cannot be used for multi-entity consolidation"
      );
    }

    period = data;
  }

  const resolvedStartDate = startDate || period?.start_date || null;
  const resolvedEndDate = endDate || period?.end_date || null;

  if (!resolvedStartDate || !resolvedEndDate) {
    throw new Error(
      "Consolidation requires an accounting period or explicit start and end dates"
    );
  }

  if (resolvedStartDate > resolvedEndDate) {
    throw new Error("Consolidation start date must be before end date");
  }

  return {
    organizationId,
    entities: selectedEntities,
    entityIds: selectedEntities.map(entity => entity.id),
    period,
    periodId: period?.id || null,
    startDate: resolvedStartDate,
    endDate: resolvedEndDate,
    currency: currencies[0] || null,
  };
}
