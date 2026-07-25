import { supabaseAdmin } from "@/lib/shared/supabase/admin";

async function resolveTransactionContext({
  organizationId,
  fromEntityId,
  toEntityId,
  requestedCurrency,
}) {
  const { data: entities, error: entityError } = await supabaseAdmin
    .from("legal_entities")
    .select(`
      id,
      organization_id,
      legal_name,
      display_name,
      currency
    `)
    .eq("organization_id", organizationId)
    .in("id", [fromEntityId, toEntityId]);

  if (entityError) {
    throw entityError;
  }

  const byId = new Map(
    (entities || []).map(entity => [String(entity.id), entity])
  );
  const fromEntity = byId.get(String(fromEntityId));
  const toEntity = byId.get(String(toEntityId));

  if (!fromEntity || !toEntity) {
    throw new Error("Intercompany entities must belong to the organization");
  }

  const { data: organization, error: organizationError } = await supabaseAdmin
    .from("organizations")
    .select("id, default_currency")
    .eq("id", organizationId)
    .maybeSingle();

  if (organizationError) {
    throw organizationError;
  }

  const entityCurrencies = [...new Set(
    [fromEntity.currency, toEntity.currency]
      .map(value => String(value || "").trim().toUpperCase())
      .filter(Boolean)
  )];
  const currency = String(
    requestedCurrency ||
    (entityCurrencies.length === 1 ? entityCurrencies[0] : "") ||
    organization?.default_currency ||
    ""
  )
    .trim()
    .toUpperCase();

  if (!currency) {
    throw new Error("Intercompany currency is not configured");
  }

  if (
    entityCurrencies.length > 1 &&
    !requestedCurrency
  ) {
    throw new Error(
      "Cross-currency intercompany transactions require an explicit configured transaction currency"
    );
  }

  return {
    fromEntity,
    toEntity,
    currency,
  };
}

export default async function createIntercompanyTransaction({
  organization_id,
  from_legal_entity_id,
  to_legal_entity_id,
  transaction_type = null,
  reference_number = null,
  description = null,
  amount,
  currency = null,
  due_date = null,
  created_by = "SYSTEM",
}) {
  try {
    if (!organization_id) {
      throw new Error("organization_id required");
    }

    if (!from_legal_entity_id) {
      throw new Error("from_legal_entity_id required");
    }

    if (!to_legal_entity_id) {
      throw new Error("to_legal_entity_id required");
    }

    if (from_legal_entity_id === to_legal_entity_id) {
      throw new Error("ENTITIES_CANNOT_MATCH");
    }

    const numericAmount = Number(amount || 0);

    if (numericAmount <= 0) {
      throw new Error("INVALID_AMOUNT");
    }

    const context = await resolveTransactionContext({
      organizationId: organization_id,
      fromEntityId: from_legal_entity_id,
      toEntityId: to_legal_entity_id,
      requestedCurrency: currency,
    });

    if (reference_number) {
      const { data: existing, error: referenceError } = await supabaseAdmin
        .from("intercompany_transactions")
        .select("id")
        .eq("organization_id", organization_id)
        .eq("reference_number", reference_number)
        .maybeSingle();

      if (referenceError) {
        throw referenceError;
      }

      if (existing) {
        throw new Error("REFERENCE_ALREADY_EXISTS");
      }
    }

    const { data, error } = await supabaseAdmin
      .from("intercompany_transactions")
      .insert([{
        organization_id,
        from_legal_entity_id,
        to_legal_entity_id,
        transaction_type,
        reference_number,
        description,
        amount: numericAmount,
        currency: context.currency,
        due_date,
        status: "pending",
        created_by,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {
      success: true,
      transaction: data,
      entities: {
        from: context.fromEntity,
        to: context.toEntity,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
