import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function toggleLegalEntity({
  organization_id,
  entity_id,
  is_active = false,
  updated_by = null,
}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!entity_id) throw new Error("entity_id required");

  const { data: entity, error: loadError } = await supabaseAdmin
    .from("legal_entities")
    .select("*")
    .eq("organization_id", organization_id)
    .eq("id", entity_id)
    .maybeSingle();

  if (loadError) throw loadError;
  if (!entity) throw new Error("Legal Entity not found");

  const nextActive = Boolean(is_active);

  if (!nextActive && entity.is_default_accounting_entity) {
    throw new Error("The default accounting entity cannot be deactivated");
  }

  if (!nextActive) {
    const { data: openPeriods, error: periodError } = await supabaseAdmin
      .from("accounting_periods")
      .select("id")
      .eq("organization_id", organization_id)
      .eq("entity_id", entity_id)
      .in("status", ["OPEN", "REOPENED"])
      .limit(1);

    if (periodError) throw periodError;
    if ((openPeriods || []).length) {
      throw new Error("Close all open accounting periods before deactivating this Legal Entity");
    }

    const { data: activeChildren, error: childError } = await supabaseAdmin
      .from("legal_entities")
      .select("id")
      .eq("organization_id", organization_id)
      .eq("parent_entity_id", entity_id)
      .eq("is_active", true)
      .limit(1);

    if (childError) throw childError;
    if ((activeChildren || []).length) {
      throw new Error("Deactivate or reassign child Legal Entities first");
    }
  }

  if (Boolean(entity.is_active) === nextActive) {
    return {
      success: true,
      entity,
      unchanged: true,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("legal_entities")
    .update({
      is_active: nextActive,
      updated_at: new Date().toISOString(),
      updated_by,
    })
    .eq("organization_id", organization_id)
    .eq("id", entity_id)
    .select("*")
    .single();

  if (error) throw error;

  await supabaseAdmin.from("audit_logs").insert({
    organization_id,
    action: nextActive
      ? "LEGAL_ENTITY_ACTIVATED"
      : "LEGAL_ENTITY_DEACTIVATED",
    entity_type: "legal_entity",
    entity_id,
    metadata: {
      code: entity.code,
      legal_name: entity.legal_name,
      updated_by,
    },
  });

  return {
    success: true,
    entity: data,
  };
}
