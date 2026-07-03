import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function toggleLegalEntity({
  organization_id,
  entity_id,
  updated_by = "system",
}) {
  const {
    data: entity,
    error: loadError,
  } = await supabaseAdmin
    .from("legal_entities")
    .select("*")
    .eq("organization_id", organization_id)
    .eq("id", entity_id)
    .single();

  if (loadError || !entity) {
    throw new Error("LEGAL_ENTITY_NOT_FOUND");
  }

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("legal_entities")
    .update({
      is_active: !entity.is_active,
      updated_at: new Date().toISOString(),
      updated_by,
    })
    .eq("id", entity.id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  await supabaseAdmin
    .from("audit_logs")
    .insert([{
      organization_id,
      action: data.is_active
        ? "LEGAL_ENTITY_ACTIVATED"
        : "LEGAL_ENTITY_DEACTIVATED",
      entity_type: "legal_entity",
      entity_id: entity.id,
      metadata: {
        code: entity.code,
        name: entity.name,
        updated_by,
      },
    }]);

  return {
    success: true,
    entity: data,
  };
}
